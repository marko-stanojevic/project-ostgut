package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// icecastResponse is the shape of /status-json.xsl.
type icecastResponse struct {
	Icestats struct {
		// Source is either a single object or an array depending on how many
		// mount points the server is broadcasting.
		Source json.RawMessage `json:"source"`
	} `json:"icestats"`
}

type icecastSource struct {
	Title     string `json:"title"`
	ListenURL string `json:"listenurl"`
	Mount     string `json:"mount"`
}

func (f *Fetcher) fetchIcecastJSON(ctx context.Context, streamURL string) (*NowPlaying, error) {
	u, err := url.Parse(streamURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParse, err)
	}
	statusURL := (&url.URL{Scheme: u.Scheme, Host: u.Host, Path: "/status-json.xsl"}).String()
	return f.fetchIcecastJSONAt(ctx, streamURL, statusURL)
}

func (f *Fetcher) fetchIcecastJSONAt(ctx context.Context, streamURL, statusURL string) (*NowPlaying, error) {
	u, err := url.Parse(streamURL)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParse, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := f.jsonClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: icecast status %d", ErrUpstreamStatus, resp.StatusCode)
	}

	var ice icecastResponse
	if err := json.NewDecoder(resp.Body).Decode(&ice); err != nil {
		return nil, fmt.Errorf("%w: decode icecast json: %v", ErrParse, err)
	}
	if len(ice.Icestats.Source) == 0 {
		return nil, fmt.Errorf("%w: no sources in icecast response", ErrEmptyMetadata)
	}

	// The source field is a single object when there is one mount point and an
	// array when there are multiple. Try array first, fall back to object.
	var sources []icecastSource
	if err := json.Unmarshal(ice.Icestats.Source, &sources); err != nil {
		var single icecastSource
		if err2 := json.Unmarshal(ice.Icestats.Source, &single); err2 != nil {
			return nil, fmt.Errorf("%w: parse icecast sources: %v", ErrParse, err)
		}
		sources = []icecastSource{single}
	}
	if len(sources) == 0 {
		return nil, fmt.Errorf("%w: empty sources array", ErrEmptyMetadata)
	}

	// Prefer the source whose mount path matches the requested stream path.
	best := &sources[0]
	streamPath := strings.ToLower(u.Path)
	for i := range sources {
		mount := strings.ToLower(sources[i].Mount)
		if mount == "" {
			mount = strings.ToLower(sources[i].ListenURL)
		}
		if strings.HasSuffix(mount, streamPath) {
			best = &sources[i]
			break
		}
	}
	if isPlaceholderTitle(best.Title) {
		return nil, fmt.Errorf("%w: no title in icecast source", ErrEmptyMetadata)
	}
	title := normalizeMetadataTitle(best.Title)

	np := &NowPlaying{
		Title:       title,
		Source:      TypeIcecast,
		MetadataURL: statusURL,
		FetchedAt:   time.Now(),
	}
	np.Artist, np.Song = splitArtistTitle(title)
	return np, nil
}
