package metadata

import (
	"context"
	"strings"
	"time"
)

type strategyFetcher func(ctx context.Context, streamURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence, error)

type autoStrategyCandidate struct {
	strategy string
	applies  func(streamURL string) bool
}

// resolve dispatches to the right strategy ladder based on Config.Type and
// any persisted hints. Always returns a non-nil NowPlaying.
func (f *Fetcher) resolve(ctx context.Context, streamURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence) {
	if !cfg.Enabled {
		return &NowPlaying{
			Source:    "",
			Supported: false,
			Status:    "disabled",
			ErrorCode: ErrorCodeDisabled,
			FetchedAt: time.Now(),
		}, FetchEvidence{Strategy: ""}
	}

	// PLS/M3U playlists are redirect indirection — resolve to the real stream
	// URL before any ICY/Icecast/Shoutcast strategy.
	if resolved, ok := f.resolvePlaylist(ctx, streamURL); ok {
		streamURL = resolved
	}

	if hinted := strings.TrimSpace(cfg.MetadataURL); hinted != "" {
		if np, ev := f.resolveHinted(ctx, streamURL, hinted, cfg, mode); np != nil && np.Title != "" {
			np.Supported = true
			np.Status = "ok"
			return np, ev
		}
	}

	if cfg.Type != TypeAuto {
		return f.resolveConfigured(ctx, streamURL, cfg, mode)
	}
	return f.resolveAuto(ctx, streamURL, cfg, mode)
}

func (f *Fetcher) resolveHinted(ctx context.Context, streamURL, metadataURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence) {
	switch hintedMetadataKind(metadataURL, cfg.SourceHint) {
	case TypeIcecast:
		iceCtx, cancel := context.WithTimeout(ctx, fallbackTimeout)
		defer cancel()
		if np, err := f.fetchIcecastJSONAt(iceCtx, streamURL, metadataURL); err == nil && np != nil && np.Title != "" {
			return np, FetchEvidence{Strategy: TypeIcecast}
		}
	case TypeShoutcast:
		scCtx, cancel := context.WithTimeout(ctx, fallbackTimeout)
		defer cancel()
		if np, err := f.fetchShoutcastAt(scCtx, metadataURL); err == nil && np != nil && np.Title != "" {
			return np, FetchEvidence{Strategy: TypeShoutcast}
		}
	default:
		if np, ev, err := f.fetchICYAdaptive(ctx, metadataURL, cfg, mode); err == nil && np != nil && np.Title != "" {
			ev.Strategy = TypeICY
			return np, ev
		}
	}
	return nil, FetchEvidence{}
}

func (f *Fetcher) resolveAuto(ctx context.Context, streamURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence) {
	var lastErr error

	strategies := f.strategyRegistry()
	for _, candidate := range autoStrategyCandidates() {
		if !candidate.applies(streamURL) {
			continue
		}

		fetchStrategy, ok := strategies[candidate.strategy]
		if !ok {
			continue
		}

		np, ev, err := fetchStrategy(ctx, streamURL, cfg, mode)
		if err == nil && np != nil && np.Title != "" {
			np.Supported = true
			np.Status = "ok"
			return np, ev
		}
		lastErr = err
		f.log.Debug("metadata: strategy failed", "url", streamURL, "strategy", candidate.strategy, "error", err)
	}

	// Race Icecast JSON and Shoutcast text endpoints concurrently. Both hit
	// different paths so they are independent; first non-empty title wins.
	if np, ev, err := f.raceIcecastShoutcast(ctx, streamURL); err == nil && np != nil && np.Title != "" {
		np.Supported = true
		np.Status = "ok"
		return np, ev
	} else if err != nil {
		lastErr = err
	}

	f.log.Debug("metadata: no metadata found", "url", streamURL, "last_error", lastErr)
	if np, ev, err := f.resolveSupplementalProvider(ctx, cfg); err == nil && np != nil && np.Title != "" {
		np.Supported = true
		np.Status = "ok"
		return np, ev
	} else if err != nil {
		lastErr = err
		f.log.Debug("metadata: supplemental provider failed", "url", streamURL, "provider", cfg.Provider, "error", err)
	}

	return &NowPlaying{
		Source:    "",
		Supported: false,
		Status:    "unsupported",
		Error:     "metadata unavailable",
		ErrorCode: ErrorCodeNoMeta,
		FetchedAt: time.Now(),
	}, FetchEvidence{}
}

// raceIcecastShoutcast queries the JSON status and Shoutcast text endpoints
// in parallel and returns the first non-empty result; the loser is cancelled.
func (f *Fetcher) raceIcecastShoutcast(ctx context.Context, streamURL string) (*NowPlaying, FetchEvidence, error) {
	type result struct {
		np       *NowPlaying
		strategy string
		err      error
	}

	raceCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	ch := make(chan result, 2)

	go func() {
		c, c2 := context.WithTimeout(raceCtx, fallbackTimeout)
		defer c2()
		np, err := f.fetchIcecastJSON(c, streamURL)
		ch <- result{np, TypeIcecast, err}
	}()
	go func() {
		c, c2 := context.WithTimeout(raceCtx, fallbackTimeout)
		defer c2()
		np, err := f.fetchShoutcast(c, streamURL)
		ch <- result{np, TypeShoutcast, err}
	}()

	var lastErr error
	for i := 0; i < 2; i++ {
		r := <-ch
		if r.err == nil && r.np != nil && r.np.Title != "" {
			return r.np, FetchEvidence{Strategy: r.strategy}, nil
		}
		if r.err != nil {
			lastErr = r.err
			f.log.Debug("metadata: fallback failed", "url", streamURL, "strategy", r.strategy, "error", r.err)
		}
	}
	return nil, FetchEvidence{}, lastErr
}

func (f *Fetcher) resolveConfigured(ctx context.Context, streamURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence) {
	fetchStrategy, ok := f.strategyRegistry()[cfg.Type]
	if !ok {
		return f.resolveAuto(ctx, streamURL, cfg, mode)
	}

	np, ev, err := fetchStrategy(ctx, streamURL, cfg, mode)

	if err == nil && np != nil && np.Title != "" {
		np.Supported = true
		np.Status = "ok"
		return np, ev
	}
	if providerNP, providerEV, providerErr := f.resolveSupplementalProvider(ctx, cfg); providerErr == nil && providerNP != nil && providerNP.Title != "" {
		providerNP.Supported = true
		providerNP.Status = "ok"
		return providerNP, providerEV
	}

	errMsg := "metadata unavailable"
	if err != nil {
		errMsg = err.Error()
	}
	return &NowPlaying{
		Source:    cfg.Type,
		Supported: false,
		Status:    "error",
		ErrorCode: errorCodeFromErr(err),
		Error:     errMsg,
		FetchedAt: time.Now(),
	}, ev
}

func (f *Fetcher) strategyRegistry() map[string]strategyFetcher {
	return map[string]strategyFetcher{
		TypeICY: func(ctx context.Context, streamURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence, error) {
			np, ev, err := f.fetchICYAdaptive(ctx, streamURL, cfg, mode)
			ev.Strategy = TypeICY
			return np, ev, err
		},
		TypeIcecast: func(ctx context.Context, streamURL string, _ Config, _ fetchMode) (*NowPlaying, FetchEvidence, error) {
			c, cancel := context.WithTimeout(ctx, fallbackTimeout)
			defer cancel()
			np, err := f.fetchIcecastJSON(c, streamURL)
			return np, FetchEvidence{Strategy: TypeIcecast}, err
		},
		TypeShoutcast: func(ctx context.Context, streamURL string, _ Config, _ fetchMode) (*NowPlaying, FetchEvidence, error) {
			c, cancel := context.WithTimeout(ctx, fallbackTimeout)
			defer cancel()
			np, err := f.fetchShoutcast(c, streamURL)
			return np, FetchEvidence{Strategy: TypeShoutcast}, err
		},
		TypeID3: func(ctx context.Context, streamURL string, _ Config, _ fetchMode) (*NowPlaying, FetchEvidence, error) {
			c, cancel := context.WithTimeout(ctx, fallbackTimeout)
			defer cancel()
			np, err := f.fetchID3(c, streamURL)
			return np, FetchEvidence{Strategy: TypeID3}, err
		},
		TypeVorbis: func(ctx context.Context, streamURL string, _ Config, _ fetchMode) (*NowPlaying, FetchEvidence, error) {
			c, cancel := context.WithTimeout(ctx, fallbackTimeout)
			defer cancel()
			np, err := f.fetchVorbis(c, streamURL)
			return np, FetchEvidence{Strategy: TypeVorbis}, err
		},
		TypeHLS:  unsupportedStrategy(TypeHLS),
		TypeDASH: unsupportedStrategy(TypeDASH),
		TypeEPG:  unsupportedStrategy(TypeEPG),
	}
}

func autoStrategyCandidates() []autoStrategyCandidate {
	return []autoStrategyCandidate{
		{strategy: TypeICY, applies: func(streamURL string) bool { return !isHLSURL(streamURL) }},
		{strategy: TypeID3, applies: isID3Candidate},
		{strategy: TypeVorbis, applies: isVorbisCandidate},
	}
}

func unsupportedStrategy(strategy string) strategyFetcher {
	return func(_ context.Context, _ string, _ Config, _ fetchMode) (*NowPlaying, FetchEvidence, error) {
		return &NowPlaying{
			Source:    strategy,
			Supported: false,
			Status:    "unsupported",
			ErrorCode: ErrorCodeNoMeta,
			FetchedAt: time.Now(),
		}, FetchEvidence{Strategy: strategy}, nil
	}
}

// hintedMetadataKind picks an ICY/Icecast/Shoutcast strategy from a hint or
// the URL suffix.
func hintedMetadataKind(metadataURL, sourceHint string) string {
	switch normalizeType(sourceHint) {
	case TypeICY, TypeIcecast, TypeShoutcast, TypeID3, TypeVorbis, TypeHLS, TypeDASH, TypeEPG:
		return normalizeType(sourceHint)
	}
	lower := strings.ToLower(strings.TrimSpace(metadataURL))
	switch {
	case strings.HasSuffix(lower, "/status-json.xsl"):
		return TypeIcecast
	case strings.HasSuffix(lower, "/currentsong"), strings.HasSuffix(lower, "/7.html"):
		return TypeShoutcast
	default:
		return TypeICY
	}
}
