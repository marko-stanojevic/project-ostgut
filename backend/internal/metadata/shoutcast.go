package metadata

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/telemetry"
)

func (f *Fetcher) fetchShoutcast(ctx context.Context, streamURL string) (*NowPlaying, error) {
	u, err := url.Parse(streamURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParse, err)
	}
	base := (&url.URL{Scheme: u.Scheme, Host: u.Host}).String()

	// Shoutcast 2: /currentsong → plain "Artist - Title".
	if np, err := f.fetchShoutcastCurrentSong(ctx, base+"/currentsong"); err == nil && np.Title != "" {
		return np, nil
	}
	// Shoutcast 1: /7.html → CSV inside HTML.
	return f.fetchShoutcast7HTML(ctx, base+"/7.html")
}

func (f *Fetcher) fetchShoutcastAt(ctx context.Context, endpoint string) (*NowPlaying, error) {
	lower := strings.ToLower(strings.TrimSpace(endpoint))
	switch {
	case strings.HasSuffix(lower, "/currentsong"):
		return f.fetchShoutcastCurrentSong(ctx, endpoint)
	case strings.HasSuffix(lower, "/7.html"):
		return f.fetchShoutcast7HTML(ctx, endpoint)
	default:
		return nil, fmt.Errorf("%w: shoutcast endpoint %q", ErrUnsupported, endpoint)
	}
}

func (f *Fetcher) fetchShoutcastCurrentSong(ctx context.Context, endpoint string) (*NowPlaying, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := telemetry.DoHTTPDependency(f.jsonClient, req, "metadata_shoutcast_currentsong_fetch")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: shoutcast /currentsong %d", ErrUpstreamStatus, resp.StatusCode)
	}

	b, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return nil, err
	}
	title := normalizeMetadataTitle(string(b))
	if isPlaceholderTitle(title) {
		return nil, fmt.Errorf("%w: empty /currentsong", ErrEmptyMetadata)
	}

	np := &NowPlaying{Title: title, Source: TypeShoutcast, MetadataURL: endpoint, FetchedAt: time.Now()}
	np.Artist, np.Song = splitArtistTitle(title)
	return np, nil
}

func (f *Fetcher) fetchShoutcast7HTML(ctx context.Context, endpoint string) (*NowPlaying, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := telemetry.DoHTTPDependency(f.jsonClient, req, "metadata_shoutcast_7html_fetch")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: shoutcast /7.html %d", ErrUpstreamStatus, resp.StatusCode)
	}

	b, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return nil, err
	}

	// Shoutcast 1 /7.html format:
	// CurrentListeners,StreamStatus,Peak,Max,Unique,Bitrate,SongTitle
	// SongTitle may itself contain commas, so SplitN(_, _, 7).
	text := stripHTML(string(b))
	parts := strings.SplitN(text, ",", 7)
	if len(parts) < 7 {
		return nil, fmt.Errorf("%w: unexpected /7.html format: %q", ErrParse, text)
	}
	title := normalizeMetadataTitle(parts[6])
	if isPlaceholderTitle(title) {
		return nil, fmt.Errorf("%w: empty title in /7.html", ErrEmptyMetadata)
	}

	np := &NowPlaying{Title: title, Source: TypeShoutcast, MetadataURL: endpoint, FetchedAt: time.Now()}
	np.Artist, np.Song = splitArtistTitle(title)
	return np, nil
}
