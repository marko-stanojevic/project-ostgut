package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const ntsLiveAPIURL = "https://www.nts.live/api/v2/live"

type ntsLiveProvider struct {
	client *http.Client
}

type ntsLiveConfig struct {
	Channel string `json:"channel"`
}

type ntsLiveResponse struct {
	Results []struct {
		ChannelName string `json:"channel_name"`
		Now         struct {
			BroadcastTitle string `json:"broadcast_title"`
			Embeds         struct {
				Details struct {
					Name string `json:"name"`
				} `json:"details"`
			} `json:"embeds"`
		} `json:"now"`
	} `json:"results"`
}

func (ntsLiveProvider) ID() string { return ProviderNTSLive }

func (p ntsLiveProvider) Fetch(ctx context.Context, raw json.RawMessage) (*NowPlaying, error) {
	cfg, err := parseNTSLiveConfig(raw)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ntsLiveAPIURL, nil)
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
		return nil, fmt.Errorf("%w: nts live status %d", ErrUpstreamStatus, res.StatusCode)
	}

	var payload ntsLiveResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("%w: decode nts live: %v", ErrParse, err)
	}
	for _, result := range payload.Results {
		if result.ChannelName != cfg.Channel {
			continue
		}
		title := normalizeMetadataTitle(firstNonEmptyString(result.Now.Embeds.Details.Name, result.Now.BroadcastTitle))
		if isPlaceholderTitle(title) {
			return nil, fmt.Errorf("%w: empty nts live title", ErrEmptyMetadata)
		}
		return &NowPlaying{
			Title:       stripNTSProviderBranding(title, cfg.Channel),
			Source:      ProviderNTSLive,
			MetadataURL: ntsLiveAPIURL,
			Supported:   true,
			Status:      "ok",
			FetchedAt:   time.Now(),
		}, nil
	}
	return nil, fmt.Errorf("%w: nts live channel %q not found", ErrEmptyMetadata, cfg.Channel)
}

func parseNTSLiveConfig(raw json.RawMessage) (ntsLiveConfig, error) {
	var cfg ntsLiveConfig
	if len(raw) == 0 {
		return cfg, fmt.Errorf("%w: nts live provider config required", ErrParse)
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("%w: parse nts live provider config: %v", ErrParse, err)
	}
	cfg.Channel = strings.TrimSpace(cfg.Channel)
	if cfg.Channel != "1" && cfg.Channel != "2" {
		return cfg, fmt.Errorf("%w: nts live channel must be 1 or 2", ErrParse)
	}
	return cfg, nil
}

func stripNTSProviderBranding(title string, channel string) string {
	normalized := strings.TrimSpace(title)
	prefix := "NTS " + channel + " - "
	if strings.HasPrefix(normalized, prefix) {
		normalized = strings.TrimSpace(strings.TrimPrefix(normalized, prefix))
	}
	return strings.TrimSpace(strings.TrimSuffix(normalized, " (R)"))
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
