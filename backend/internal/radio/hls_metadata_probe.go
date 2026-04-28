package radio

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/telemetry"
)

const hlsMetadataProbeBudget = 8 * time.Second

// ProbeHLSID3Support checks whether an HLS stream exposes in-segment ID3 tags.
// It resolves at most one playlist indirection (master -> media) and then reads
// the first few KB of the first media segment looking for an ID3 tag header.
func ProbeHLSID3Support(ctx context.Context, client *http.Client, playlistURL string) bool {
	playlistURL = strings.TrimSpace(playlistURL)
	if playlistURL == "" {
		return false
	}
	if client == nil {
		client = &http.Client{Timeout: hlsMetadataProbeBudget}
	}

	_, body, parsed, err := fetchPlaylistBody(ctx, client, playlistURL)
	if err != nil {
		return false
	}

	entry := firstM3UEntry(body, parsed)
	if entry == "" {
		return false
	}

	if strings.HasSuffix(strings.ToLower(strings.Split(entry, "?")[0]), ".m3u8") {
		_, body, parsed, err = fetchPlaylistBody(ctx, client, entry)
		if err != nil {
			return false
		}
		entry = firstM3UEntry(body, parsed)
		if entry == "" {
			return false
		}
	}

	segmentURL := entry
	segReq, err := http.NewRequestWithContext(ctx, http.MethodGet, segmentURL, nil)
	if err != nil {
		return false
	}
	segReq.Close = true
	segReq.Header.Set("User-Agent", streamProbeUserAgent)
	segReq.Header.Set("Range", "bytes=0-8191")
	segReq.Header.Set("Connection", "close")

	segResp, err := telemetry.DoHTTPDependency(client, segReq, "hls_id3_segment_probe")
	if err != nil {
		return false
	}
	defer segResp.Body.Close()

	if segResp.StatusCode < 200 || segResp.StatusCode >= 400 {
		return false
	}

	segmentBytes, err := io.ReadAll(io.LimitReader(segResp.Body, 8192))
	if err != nil {
		return false
	}

	return bytes.Contains(segmentBytes, []byte("ID3")) || bytes.Contains(segmentBytes, []byte("PRIV"))
}

func fetchPlaylistBody(ctx context.Context, client *http.Client, playlistURL string) (string, string, *url.URL, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, playlistURL, nil)
	if err != nil {
		return "", "", nil, err
	}
	req.Close = true
	req.Header.Set("User-Agent", streamProbeUserAgent)
	req.Header.Set("Connection", "close")

	resp, err := telemetry.DoHTTPDependency(client, req, "hls_playlist_probe")
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return "", "", nil, fmt.Errorf("playlist status %d", resp.StatusCode)
	}

	finalURL := playlistURL
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	parsed, _ := url.Parse(finalURL)
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", "", nil, err
	}
	return finalURL, string(body), parsed, nil
}
