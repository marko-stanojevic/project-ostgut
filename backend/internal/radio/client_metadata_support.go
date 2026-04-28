package radio

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/telemetry"
)

type ClientMetadataSupportResult struct {
	Supported   bool
	MetadataURL string
	CheckedAt   time.Time
}

func ResolveMetadataResolver(metadataEnabled bool, clientSupported bool) string {
	if !metadataEnabled {
		return "none"
	}
	if clientSupported {
		return "client"
	}
	return "server"
}

func ResolveMetadataResolverForStream(metadataEnabled bool, kind string, clientSupported bool, hlsID3Supported bool) string {
	if !metadataEnabled {
		return "none"
	}
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "hls":
		if hlsID3Supported {
			return "client"
		}
		return "none"
	case "dash":
		return "none"
	}
	return ResolveMetadataResolver(metadataEnabled, clientSupported)
}

func ProbeClientMetadataSupport(
	ctx context.Context,
	client *http.Client,
	origins []string,
	streamURL string,
	hintedMetadataURL string,
	kind string,
	container string,
	metadataEnabled bool,
	metadataType string,
) ClientMetadataSupportResult {
	result := ClientMetadataSupportResult{CheckedAt: time.Now().UTC()}

	if !metadataEnabled {
		return result
	}
	if kind != "direct" || container != "none" {
		return result
	}

	parsed, err := url.Parse(strings.TrimSpace(streamURL))
	if err != nil || parsed == nil || parsed.Host == "" {
		return result
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return result
	}
	if isDisallowedProbeURL(parsed) {
		return result
	}

	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	origins = normalizeOrigins(origins)
	if len(origins) == 0 {
		return result
	}

	if supported, metadataURL := probeHintedClientMetadataSupport(ctx, client, origins, streamURL, hintedMetadataURL); supported {
		result.Supported = true
		result.MetadataURL = metadataURL
		return result
	}

	switch strings.ToLower(strings.TrimSpace(metadataType)) {
	case "icy":
		result.Supported, result.MetadataURL = probeClientICYSupport(ctx, client, origins, streamURL)
	case "icecast":
		result.Supported, result.MetadataURL = probeClientIcecastSupport(ctx, client, origins, streamURL)
	case "shoutcast":
		result.Supported, result.MetadataURL = probeClientShoutcastSupport(ctx, client, origins, streamURL)
	default:
		if supported, metadataURL := probeClientICYSupport(ctx, client, origins, streamURL); supported {
			result.Supported = true
			result.MetadataURL = metadataURL
			break
		}
		if supported, metadataURL := probeClientIcecastSupport(ctx, client, origins, streamURL); supported {
			result.Supported = true
			result.MetadataURL = metadataURL
			break
		}
		result.Supported, result.MetadataURL = probeClientShoutcastSupport(ctx, client, origins, streamURL)
	}

	return result
}

func probeHintedClientMetadataSupport(ctx context.Context, client *http.Client, origins []string, streamURL string, hintedMetadataURL string) (bool, string) {
	hintedMetadataURL = strings.TrimSpace(hintedMetadataURL)
	if hintedMetadataURL == "" || strings.EqualFold(hintedMetadataURL, strings.TrimSpace(streamURL)) {
		return false, ""
	}

	switch inferHintedMetadataType(hintedMetadataURL) {
	case "icecast":
		return probeClientIcecastEndpoint(ctx, client, origins, hintedMetadataURL)
	case "shoutcast-currentsong":
		return probeClientShoutcastCurrentSongEndpoint(ctx, client, origins, hintedMetadataURL)
	case "shoutcast-7html":
		return probeClientShoutcastHTMLEndpoint(ctx, client, origins, hintedMetadataURL)
	default:
		return false, ""
	}
}

func probeClientICYSupport(ctx context.Context, client *http.Client, origins []string, streamURL string) (bool, string) {
	for _, origin := range origins {
		if !allowICYPreflight(ctx, client, streamURL, origin) {
			continue
		}
		if allowICYRead(ctx, client, streamURL, origin) {
			return true, streamURL
		}
	}
	return false, ""
}

func allowICYPreflight(ctx context.Context, client *http.Client, target string, origin string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodOptions, target, nil)
	if err != nil {
		return false
	}
	req.Close = true
	req.Header.Set("Origin", origin)
	req.Header.Set("User-Agent", streamProbeUserAgent)
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)
	req.Header.Set("Access-Control-Request-Headers", "Icy-Metadata")

	resp, err := telemetry.DoHTTPDependency(client, req, "client_metadata_preflight")
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return false
	}

	return allowsOrigin(resp.Header, origin) && allowsHeader(resp.Header, "Icy-Metadata")
}

func allowICYRead(ctx context.Context, client *http.Client, target string, origin string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return false
	}
	req.Close = true
	req.Header.Set("Origin", origin)
	req.Header.Set("User-Agent", streamProbeUserAgent)
	req.Header.Set("Icy-Metadata", "1")
	req.Header.Set("Connection", "close")

	resp, err := telemetry.DoHTTPDependency(client, req, "client_metadata_icy_read")
	if err != nil {
		return false
	}
	// Drain a tiny bit then close so the connection can be released without
	// waiting on an infinite audio stream.
	go func() {
		_, _ = io.CopyN(io.Discard, resp.Body, 64)
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return false
	}

	if !allowsOrigin(resp.Header, origin) || !exposesHeader(resp.Header, "Icy-Metaint") {
		return false
	}

	return strings.TrimSpace(resp.Header.Get("Icy-Metaint")) != ""
}

func probeClientIcecastSupport(ctx context.Context, client *http.Client, origins []string, streamURL string) (bool, string) {
	base, err := metadataBaseURL(streamURL)
	if err != nil {
		return false, ""
	}
	endpoint := fmt.Sprintf("%s/status-json.xsl", base)
	return probeClientIcecastEndpoint(ctx, client, origins, endpoint)

}

func probeClientIcecastEndpoint(ctx context.Context, client *http.Client, origins []string, endpoint string) (bool, string) {
	for _, origin := range origins {
		body, ok := fetchCORSReadableBody(ctx, client, endpoint, origin)
		if !ok {
			continue
		}

		var payload struct {
			IceStats struct {
				Source any `json:"source"`
			} `json:"icestats"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			continue
		}
		if payload.IceStats.Source != nil {
			return true, endpoint
		}
	}

	return false, ""
}

func probeClientShoutcastSupport(ctx context.Context, client *http.Client, origins []string, streamURL string) (bool, string) {
	base, err := metadataBaseURL(streamURL)
	if err != nil {
		return false, ""
	}

	for _, origin := range origins {
		currentSongURL := fmt.Sprintf("%s/currentsong", base)
		if supported, metadataURL := probeClientShoutcastCurrentSongEndpoint(ctx, client, []string{origin}, currentSongURL); supported {
			return true, metadataURL
		}

		htmlURL := fmt.Sprintf("%s/7.html", base)
		if supported, metadataURL := probeClientShoutcastHTMLEndpoint(ctx, client, []string{origin}, htmlURL); supported {
			return true, metadataURL
		}
	}

	return false, ""
}

func probeClientShoutcastCurrentSongEndpoint(ctx context.Context, client *http.Client, origins []string, endpoint string) (bool, string) {
	for _, origin := range origins {
		body, ok := fetchCORSReadableBody(ctx, client, endpoint, origin)
		if !ok {
			continue
		}
		if title := strings.TrimSpace(string(body)); !isPlaceholderMetadataTitle(title) {
			return true, endpoint
		}
	}
	return false, ""
}

func probeClientShoutcastHTMLEndpoint(ctx context.Context, client *http.Client, origins []string, endpoint string) (bool, string) {
	for _, origin := range origins {
		body, ok := fetchCORSReadableBody(ctx, client, endpoint, origin)
		if !ok {
			continue
		}
		if title, ok := parseShoutcastHTMLTitle(string(body)); ok && !isPlaceholderMetadataTitle(title) {
			return true, endpoint
		}
	}
	return false, ""
}

func normalizeOrigins(origins []string) []string {
	out := make([]string, 0, len(origins))
	for _, origin := range origins {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func fetchCORSReadableBody(ctx context.Context, client *http.Client, endpoint string, origin string) ([]byte, bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, false
	}
	req.Close = true
	req.Header.Set("Origin", origin)
	req.Header.Set("User-Agent", streamProbeUserAgent)

	resp, err := telemetry.DoHTTPDependency(client, req, "client_metadata_endpoint_read")
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return nil, false
	}
	if !allowsOrigin(resp.Header, origin) {
		return nil, false
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return nil, false
	}
	return body, true
}

func metadataBaseURL(streamURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(streamURL))
	if err != nil || parsed == nil || parsed.Host == "" {
		return "", fmt.Errorf("invalid stream url")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("unsupported scheme")
	}
	return fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host), nil
}

func inferHintedMetadataType(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return ""
	}
	path := strings.ToLower(strings.TrimSpace(parsed.Path))
	switch {
	case strings.HasSuffix(path, "/status-json.xsl"):
		return "icecast"
	case strings.HasSuffix(path, "/currentsong"):
		return "shoutcast-currentsong"
	case strings.HasSuffix(path, "/7.html"):
		return "shoutcast-7html"
	default:
		return ""
	}
}

func allowsOrigin(headers http.Header, origin string) bool {
	value := strings.TrimSpace(headers.Get("Access-Control-Allow-Origin"))
	if value == "*" {
		return true
	}
	return strings.EqualFold(value, origin)
}

func allowsHeader(headers http.Header, name string) bool {
	for _, part := range strings.Split(headers.Get("Access-Control-Allow-Headers"), ",") {
		trimmed := strings.TrimSpace(part)
		if trimmed == "*" || strings.EqualFold(trimmed, name) {
			return true
		}
	}
	return false
}

func exposesHeader(headers http.Header, name string) bool {
	for _, part := range strings.Split(headers.Get("Access-Control-Expose-Headers"), ",") {
		trimmed := strings.TrimSpace(part)
		if trimmed == "*" || strings.EqualFold(trimmed, name) {
			return true
		}
	}
	return false
}

func parseShoutcastHTMLTitle(raw string) (string, bool) {
	text := strings.TrimSpace(stripSimpleHTML(raw))
	parts := strings.Split(text, ",")
	if len(parts) < 7 {
		return "", false
	}
	if !allNumeric(parts[:6]) {
		return "", false
	}
	return strings.TrimSpace(parts[6]), true
}

func stripSimpleHTML(raw string) string {
	replacer := strings.NewReplacer("<HTML>", "", "</HTML>", "", "<html>", "", "</html>", "", "<body>", "", "</body>", "")
	return replacer.Replace(raw)
}

func allNumeric(values []string) bool {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			return false
		}
		for _, r := range value {
			if r < '0' || r > '9' {
				return false
			}
		}
	}
	return true
}

func isPlaceholderMetadataTitle(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "-", "please", "loading", "unknown", "untitled", "stream", "station", "advertisement", "ads", "n/a", "na":
		return true
	default:
		return false
	}
}
