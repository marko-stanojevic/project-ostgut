package metadata

import (
	"context"
	"encoding/json"
	"fmt"
)

const (
	ProviderNPRComposer = "npr-composer"
	ProviderNTSLive     = "nts-live"
)

type SupplementalProvider interface {
	ID() string
	Fetch(ctx context.Context, raw json.RawMessage) (*NowPlaying, error)
}

func (f *Fetcher) resolveSupplementalProvider(ctx context.Context, cfg Config) (*NowPlaying, FetchEvidence, error) {
	providerID := normalizeProvider(cfg.Provider)
	if providerID == "" {
		return nil, FetchEvidence{}, nil
	}

	provider, ok := f.providerRegistry()[providerID]
	if !ok {
		return nil, FetchEvidence{}, fmt.Errorf("metadata provider %q not registered", providerID)
	}

	providerCtx, cancel := context.WithTimeout(ctx, fallbackTimeout)
	defer cancel()
	np, err := provider.Fetch(providerCtx, cfg.ProviderConfig)
	if err != nil {
		return nil, FetchEvidence{Strategy: providerID}, err
	}
	return np, FetchEvidence{Strategy: providerID}, nil
}

func (f *Fetcher) providerRegistry() map[string]SupplementalProvider {
	return map[string]SupplementalProvider{
		ProviderNPRComposer: nprComposerProvider{client: f.jsonClient},
		ProviderNTSLive:     ntsLiveProvider{client: f.jsonClient},
	}
}
