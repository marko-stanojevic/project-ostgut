package metadata

import (
	"context"
	"io"
	"net/http"
	"strings"
)

// isHLSURL reports whether a URL points to an HLS stream (.m3u8).
func isHLSURL(u string) bool {
	lower := strings.ToLower(u)
	if idx := strings.IndexByte(lower, '?'); idx != -1 {
		lower = lower[:idx]
	}
	return strings.HasSuffix(lower, ".m3u8")
}

// resolvePlaylist detects PLS and M3U playlist URLs and returns the first
// stream URL inside. Returns ("", false) when the URL is not a playlist or
// resolution fails — the caller should proceed with the original URL.
func (f *Fetcher) resolvePlaylist(ctx context.Context, rawURL string) (string, bool) {
	lower := strings.ToLower(rawURL)
	if idx := strings.IndexByte(lower, '?'); idx != -1 {
		lower = lower[:idx]
	}
	isPLS := strings.HasSuffix(lower, ".pls")
	isM3U := strings.HasSuffix(lower, ".m3u")
	if !isPLS && !isM3U {
		return "", false
	}

	reqCtx, cancel := context.WithTimeout(ctx, fallbackTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", false
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := f.jsonClient.Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", false
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return "", false
	}
	text := string(body)
	if isPLS {
		return parsePLS(text)
	}
	return parseM3U(text)
}

// parsePLS extracts the first File entry from a PLS playlist.
func parsePLS(text string) (string, bool) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line) // also strips trailing \r
		if !strings.HasPrefix(strings.ToLower(line), "file") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx == -1 {
			continue
		}
		u := strings.TrimSpace(line[idx+1:])
		if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
			return u, true
		}
	}
	return "", false
}

// parseM3U extracts the first non-comment URL from an M3U/M3U8 playlist.
func parseM3U(text string) (string, bool) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line) // strips trailing \r
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "http://") || strings.HasPrefix(line, "https://") {
			return line, true
		}
	}
	return "", false
}
