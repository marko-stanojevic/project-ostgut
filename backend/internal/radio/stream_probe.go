package radio

import (
	"bytes"
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

const streamProbeUserAgent = "bouji.fm/1.0 (radio@worksfine.app)"
const maxProbeRedirects = 5
const maxProbeHostChanges = 2

type StreamProbeResult struct {
	URL           string
	ResolvedURL   string
	Kind          string
	Container     string
	Transport     string
	MimeType      string
	Codec         string
	Bitrate       int
	BitDepth      int
	SampleRateHz  int
	Channels      int
	LastError     *string
	LastCheckedAt time.Time
}

func LightClassifyStreamURL(rawURL string) StreamProbeResult {
	now := time.Now().UTC()
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		msg := err.Error()
		return StreamProbeResult{
			URL:           strings.TrimSpace(rawURL),
			ResolvedURL:   strings.TrimSpace(rawURL),
			Kind:          "direct",
			Container:     "none",
			Transport:     "http",
			LastError:     &msg,
			LastCheckedAt: now,
		}
	}

	kind, container := classifyPath(u.Path)
	transport := "http"
	if strings.EqualFold(u.Scheme, "https") {
		transport = "https"
	}

	return StreamProbeResult{
		URL:           strings.TrimSpace(rawURL),
		ResolvedURL:   strings.TrimSpace(rawURL),
		Kind:          kind,
		Container:     container,
		Transport:     transport,
		Codec:         codecFromPath(u.Path),
		LastCheckedAt: now,
	}
}

func ProbeStream(ctx context.Context, client *http.Client, rawURL string) StreamProbeResult {
	base := LightClassifyStreamURL(rawURL)
	base.LastCheckedAt = time.Now().UTC()

	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Scheme == "" || u.Host == "" {
		msg := "stream URL must be a valid absolute URL"
		base.LastError = &msg
		return base
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		msg := "stream URL must use http or https"
		base.LastError = &msg
		return base
	}
	if isDisallowedProbeURL(u) {
		msg := "stream URL points to a disallowed host"
		base.LastError = &msg
		return base
	}

	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	safeClient := *client
	safeClient.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxProbeRedirects {
			return fmt.Errorf("too many redirects")
		}
		if req == nil || req.URL == nil {
			return errors.New("invalid redirect URL")
		}
		if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
			return fmt.Errorf("redirect uses unsupported scheme")
		}
		if isDisallowedProbeURL(req.URL) {
			return fmt.Errorf("redirect target is disallowed")
		}
		if redirectHostChangeCount(via, req.URL) > maxProbeHostChanges {
			return fmt.Errorf("too many redirect host changes")
		}
		return nil
	}

	resolved, err := probeRecursive(ctx, &safeClient, strings.TrimSpace(rawURL), 0)
	if err != nil {
		msg := err.Error()
		base.LastError = &msg
		return base
	}
	return resolved
}

func probeRecursive(ctx context.Context, client *http.Client, target string, depth int) (StreamProbeResult, error) {
	const maxDepth = 3
	if depth > maxDepth {
		return StreamProbeResult{}, fmt.Errorf("playlist resolution depth exceeded")
	}
	targetURL, err := url.Parse(strings.TrimSpace(target))
	if err != nil || targetURL == nil {
		return StreamProbeResult{}, fmt.Errorf("invalid probe URL")
	}
	if isDisallowedProbeURL(targetURL) {
		return StreamProbeResult{}, fmt.Errorf("probe URL target is disallowed")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return StreamProbeResult{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", streamProbeUserAgent)
	req.Header.Set("Range", "bytes=0-65535")
	req.Header.Set("Icy-Metadata", "1")

	resp, err := client.Do(req)
	if err != nil {
		return StreamProbeResult{}, fmt.Errorf("probe request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return StreamProbeResult{}, fmt.Errorf("probe status %d", resp.StatusCode)
	}

	finalURL := target
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	finalParsed, _ := url.Parse(finalURL)
	if finalParsed == nil || isDisallowedProbeURL(finalParsed) {
		return StreamProbeResult{}, fmt.Errorf("resolved URL target is disallowed")
	}
	kindByPath, containerByPath := classifyPath(finalParsed.Path)

	contentType := strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Type")))
	contentType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	kindByType, containerByType := classifyContentType(contentType)

	kind := kindByType
	container := containerByType
	if kind == "" {
		kind = kindByPath
		container = containerByPath
	}
	if kind == "" {
		kind = "direct"
		container = "none"
	}

	transport := "http"
	if finalParsed != nil && strings.EqualFold(finalParsed.Scheme, "https") {
		transport = "https"
	}
	if resp.Header.Get("Icy-Metaint") != "" || resp.Header.Get("Icy-Name") != "" {
		transport = "icy"
	}

	codec := codecFromContentType(contentType)
	if codec == "" {
		codec = codecFromPath(finalParsed.Path)
	}
	bitrate := parseBitrateHeader(resp.Header.Get("Icy-Br"))

	result := StreamProbeResult{
		URL:           target,
		ResolvedURL:   finalURL,
		Kind:          kind,
		Container:     container,
		Transport:     transport,
		MimeType:      contentType,
		Codec:         codec,
		Bitrate:       bitrate,
		LastCheckedAt: time.Now().UTC(),
	}

	if kind != "playlist" && isLikelyFLAC(codec, contentType, finalURL) {
		probeBytes, readErr := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
		if readErr == nil {
			if sr, bd, ch, ok := parseFLACStreamInfo(probeBytes); ok {
				result.SampleRateHz = sr
				result.BitDepth = bd
				result.Channels = ch
			}
		}
	}

	if kind != "playlist" {
		return result, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return result, fmt.Errorf("read playlist body: %w", err)
	}

	var nested string
	switch container {
	case "pls":
		nested = firstPLSEntry(string(body), finalParsed)
	default:
		nested = firstM3UEntry(string(body), finalParsed)
	}
	if nested == "" {
		return result, fmt.Errorf("playlist contains no playable URL")
	}

	next, err := probeRecursive(ctx, client, nested, depth+1)
	if err != nil {
		return result, err
	}
	next.URL = target
	return next, nil
}

func classifyPath(p string) (kind string, container string) {
	ext := strings.ToLower(path.Ext(strings.TrimSpace(p)))
	switch ext {
	case ".m3u8":
		return "hls", "m3u8"
	case ".m3u":
		return "playlist", "m3u"
	case ".pls":
		return "playlist", "pls"
	default:
		return "direct", "none"
	}
}

func classifyContentType(ct string) (kind string, container string) {
	switch {
	case strings.Contains(ct, "application/vnd.apple.mpegurl"), strings.Contains(ct, "application/x-mpegurl"):
		return "hls", "m3u8"
	case strings.Contains(ct, "audio/x-scpls"), strings.Contains(ct, "application/pls+xml"):
		return "playlist", "pls"
	case strings.Contains(ct, "audio/x-mpegurl"):
		return "playlist", "m3u"
	default:
		return "", ""
	}
}

func codecFromContentType(ct string) string {
	switch {
	case strings.Contains(ct, "audio/mpeg"):
		return "MP3"
	case strings.Contains(ct, "aac"), strings.Contains(ct, "aacp"):
		return "AAC"
	case strings.Contains(ct, "flac"):
		return "FLAC"
	default:
		return ""
	}
}

func codecFromPath(p string) string {
	ext := strings.ToLower(path.Ext(strings.TrimSpace(p)))
	switch ext {
	case ".mp3":
		return "MP3"
	case ".aac", ".aacp":
		return "AAC"
	case ".flac":
		return "FLAC"
	default:
		return ""
	}
}

func parseBitrateHeader(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 0 {
		return 0
	}
	return v
}

func isLikelyFLAC(codec, mimeType, streamURL string) bool {
	lc := strings.ToLower(strings.TrimSpace(codec))
	if strings.Contains(lc, "flac") {
		return true
	}
	lm := strings.ToLower(strings.TrimSpace(mimeType))
	if strings.Contains(lm, "flac") {
		return true
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(streamURL)), "flac")
}

func parseFLACStreamInfo(data []byte) (sampleRateHz int, bitDepth int, channels int, ok bool) {
	start := bytes.Index(data, []byte("fLaC"))
	if start < 0 || len(data[start:]) < 4 {
		return 0, 0, 0, false
	}

	i := start + 4
	for i+4 <= len(data) {
		header := data[i]
		blockType := header & 0x7F
		length := int(data[i+1])<<16 | int(data[i+2])<<8 | int(data[i+3])
		i += 4
		if length < 0 || i+length > len(data) {
			return 0, 0, 0, false
		}
		block := data[i : i+length]
		i += length

		if blockType != 0 { // STREAMINFO
			continue
		}
		if len(block) < 18 {
			return 0, 0, 0, false
		}

		// STREAMINFO bytes 10..17 pack:
		// sample rate (20 bits), channels-1 (3 bits), bits per sample-1 (5 bits), total samples (36 bits)
		packed := binary.BigEndian.Uint64(block[10:18])
		sr := int((packed >> 44) & 0xFFFFF)
		ch := int((packed>>41)&0x7) + 1
		bd := int((packed>>36)&0x1F) + 1
		if sr <= 0 || ch <= 0 || bd <= 0 {
			return 0, 0, 0, false
		}
		return sr, bd, ch, true
	}
	return 0, 0, 0, false
}

func firstPLSEntry(body string, base *url.URL) string {
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if !strings.HasPrefix(lower, "file") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx == -1 {
			continue
		}
		raw := strings.TrimSpace(line[idx+1:])
		if abs := absolutePlaylistEntry(raw, base); abs != "" {
			return abs
		}
	}
	return ""
}

func firstM3UEntry(body string, base *url.URL) string {
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if abs := absolutePlaylistEntry(line, base); abs != "" {
			return abs
		}
	}
	return ""
}

func absolutePlaylistEntry(raw string, base *url.URL) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if parsed.Scheme == "http" || parsed.Scheme == "https" {
		if isDisallowedProbeURL(parsed) {
			return ""
		}
		return parsed.String()
	}
	if base != nil {
		resolved := base.ResolveReference(parsed)
		if resolved.Scheme == "http" || resolved.Scheme == "https" {
			if isDisallowedProbeURL(resolved) {
				return ""
			}
			return resolved.String()
		}
	}
	return ""
}

func redirectHostChangeCount(via []*http.Request, next *url.URL) int {
	if len(via) == 0 || via[0] == nil || via[0].URL == nil || next == nil {
		return 0
	}

	prevHost := strings.ToLower(via[0].URL.Hostname())
	count := 0
	for i := 1; i < len(via); i++ {
		if via[i] == nil || via[i].URL == nil {
			continue
		}
		host := strings.ToLower(via[i].URL.Hostname())
		if host != "" && prevHost != "" && host != prevHost {
			count++
		}
		prevHost = host
	}
	nextHost := strings.ToLower(next.Hostname())
	if nextHost != "" && prevHost != "" && nextHost != prevHost {
		count++
	}
	return count
}

func isDisallowedProbeURL(u *url.URL) bool {
	if u == nil {
		return true
	}
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "" {
		return true
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return true
	}

	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}

	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}
