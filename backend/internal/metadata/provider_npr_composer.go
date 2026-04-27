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

const nprComposerPlaylistBaseURL = "https://api.composer.nprstations.org/v1/widget/%s/playlist?limit=50&order=-1"

type nprComposerProvider struct {
	client *http.Client
}

type nprComposerConfig struct {
	UCS string `json:"ucs"`
}

type nprComposerResponse struct {
	Playlist []struct {
		Playlist []nprComposerTrack `json:"playlist"`
	} `json:"playlist"`
}

type nprComposerTrack struct {
	NowPlaying     bool   `json:"now_playing"`
	TrackName      string `json:"trackName"`
	ArtistName     string `json:"artistName"`
	CollectionName string `json:"collectionName"`
}

func (nprComposerProvider) ID() string { return ProviderNPRComposer }

func (p nprComposerProvider) Fetch(ctx context.Context, raw json.RawMessage) (*NowPlaying, error) {
	cfg, err := parseNPRComposerConfig(raw)
	if err != nil {
		return nil, err
	}
	endpoint := fmt.Sprintf(nprComposerPlaylistBaseURL, url.PathEscape(cfg.UCS))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)

	res, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("%w: npr composer status %d", ErrUpstreamStatus, res.StatusCode)
	}

	var payload nprComposerResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("%w: decode npr composer playlist: %v", ErrParse, err)
	}
	track := selectNPRComposerTrack(payload)
	if track == nil {
		return nil, fmt.Errorf("%w: no npr composer now playing track", ErrEmptyMetadata)
	}

	title := normalizeMetadataTitle(track.TrackName)
	if isPlaceholderTitle(title) {
		return nil, fmt.Errorf("%w: empty npr composer title", ErrEmptyMetadata)
	}
	artist := strings.TrimSpace(track.ArtistName)
	return &NowPlaying{
		Title:       title,
		Artist:      artist,
		Song:        title,
		Source:      ProviderNPRComposer,
		MetadataURL: endpoint,
		Supported:   true,
		Status:      "ok",
		FetchedAt:   time.Now(),
	}, nil
}

func parseNPRComposerConfig(raw json.RawMessage) (nprComposerConfig, error) {
	var cfg nprComposerConfig
	if len(raw) == 0 {
		return cfg, fmt.Errorf("%w: npr composer provider config required", ErrParse)
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("%w: parse npr composer provider config: %v", ErrParse, err)
	}
	cfg.UCS = strings.TrimSpace(cfg.UCS)
	if cfg.UCS == "" {
		return cfg, fmt.Errorf("%w: npr composer ucs required", ErrParse)
	}
	return cfg, nil
}

func selectNPRComposerTrack(payload nprComposerResponse) *nprComposerTrack {
	var latest *nprComposerTrack
	for i := range payload.Playlist {
		for j := range payload.Playlist[i].Playlist {
			track := &payload.Playlist[i].Playlist[j]
			if strings.TrimSpace(track.TrackName) == "" {
				continue
			}
			latest = track
			if track.NowPlaying {
				return track
			}
		}
	}
	return latest
}
