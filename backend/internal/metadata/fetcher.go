package metadata

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// Option configures a Fetcher at construction time.
type Option func(*Fetcher)

// WithMetrics installs a Metrics implementation. Default is a no-op.
func WithMetrics(m Metrics) Option {
	return func(f *Fetcher) {
		if m != nil {
			f.metrics = m
		}
	}
}

// WithMaxCacheEntries caps the in-process cache size. When exceeded the
// fetcher first sweeps expired entries; if still over, it evicts arbitrary
// entries until under the cap. Default 4096.
func WithMaxCacheEntries(n int) Option {
	return func(f *Fetcher) {
		if n > 0 {
			f.maxCacheEntries = n
		}
	}
}

// fetchMode controls whether ICY delayed-budget detection is enabled.
type fetchMode int

const (
	modeRuntime fetchMode = iota // poller path: single budget per cfg.DelayedICY
	modeProbe                    // admin path: try fast then delayed; bypass cache
)

// cacheKey is the typed cache identity. Used directly as a map key so we are
// not exposed to string-encoding collisions.
type cacheKey struct {
	URL         string
	Type        string
	Enabled     bool
	SourceHint  string
	MetadataURL string
	DelayedICY  bool
}

func (k cacheKey) groupKey() string {
	return fmt.Sprintf("%s|%s|%t|%s|%s|%t",
		k.URL, k.Type, k.Enabled, k.SourceHint, k.MetadataURL, k.DelayedICY)
}

func (cfg Config) cacheKey(streamURL string) cacheKey {
	return cacheKey{
		URL:         streamURL,
		Type:        normalizeType(cfg.Type),
		Enabled:     cfg.Enabled,
		SourceHint:  normalizeType(cfg.SourceHint),
		MetadataURL: cfg.MetadataURL,
		DelayedICY:  cfg.DelayedICY,
	}
}

type cachedEntry struct {
	np       *NowPlaying
	strategy string
	exp      time.Time
}

// Fetcher fetches now-playing metadata and caches results per stream URL.
type Fetcher struct {
	jsonClient      *http.Client // lightweight JSON / text fallbacks
	icyClient       *http.Client // ICY in-stream; no Timeout, only context deadlines
	log             *slog.Logger
	metrics         Metrics
	maxCacheEntries int

	mu    sync.Mutex
	cache map[cacheKey]cachedEntry
	group singleflight.Group

	stop     chan struct{}
	stopOnce sync.Once
	wg       sync.WaitGroup
}

// NewFetcher constructs a Fetcher and starts its eviction goroutine. Call
// Close to stop the goroutine cleanly (e.g. in tests or on shutdown).
func NewFetcher(log *slog.Logger, opts ...Option) *Fetcher {
	f := &Fetcher{
		jsonClient: &http.Client{Timeout: fallbackTimeout},
		icyClient: &http.Client{
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				req.Header.Set("Icy-Metadata", "1")
				req.Header.Set("User-Agent", userAgent)
				if len(via) >= 5 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
		log:             log,
		metrics:         nopMetrics{},
		maxCacheEntries: defaultMaxCacheEntries,
		cache:           make(map[cacheKey]cachedEntry),
		stop:            make(chan struct{}),
	}
	for _, opt := range opts {
		opt(f)
	}
	f.wg.Add(1)
	go f.runEviction()
	return f
}

// Close stops the eviction goroutine. Safe to call multiple times.
func (f *Fetcher) Close() error {
	f.stopOnce.Do(func() { close(f.stop) })
	f.wg.Wait()
	return nil
}

func (f *Fetcher) runEviction() {
	defer f.wg.Done()
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-f.stop:
			return
		case <-ticker.C:
			f.sweepExpired()
		}
	}
}

func (f *Fetcher) sweepExpired() {
	now := time.Now()
	f.mu.Lock()
	defer f.mu.Unlock()
	for k, e := range f.cache {
		if now.After(e.exp) {
			delete(f.cache, k)
		}
	}
}

// enforceCacheBound assumes f.mu is held. Drops expired first; if still over
// the cap, drops arbitrary entries until at the cap. Map iteration order is
// random which is acceptable as a soft LRU approximation here — the fetcher
// is not the right place for a precise LRU and a real one belongs in Redis
// once we run multi-instance.
func (f *Fetcher) enforceCacheBound() {
	if len(f.cache) <= f.maxCacheEntries {
		return
	}
	now := time.Now()
	for k, e := range f.cache {
		if now.After(e.exp) {
			delete(f.cache, k)
		}
	}
	for k := range f.cache {
		if len(f.cache) <= f.maxCacheEntries {
			return
		}
		delete(f.cache, k)
	}
}

// Fetch returns now-playing metadata for the runtime path (poller / SSE).
// Cached for 30 s on success, 3 min on miss. Never returns nil.
func (f *Fetcher) Fetch(ctx context.Context, streamURL string, cfg Config) (*NowPlaying, FetchEvidence) {
	return f.fetch(ctx, streamURL, cfg, modeRuntime)
}

// Probe returns now-playing metadata for the admin/diagnostic path. Bypasses
// the cache and tries the extended ICY budget so the system can learn whether
// a stream delays its metadata. Never returns nil.
func (f *Fetcher) Probe(ctx context.Context, streamURL string, cfg Config) (*NowPlaying, FetchEvidence) {
	return f.fetch(ctx, streamURL, cfg, modeProbe)
}

func (f *Fetcher) fetch(ctx context.Context, streamURL string, cfg Config, mode fetchMode) (*NowPlaying, FetchEvidence) {
	cfg.Type = normalizeType(cfg.Type)
	cfg.SourceHint = normalizeType(cfg.SourceHint)
	key := cfg.cacheKey(streamURL)

	if mode == modeRuntime {
		f.mu.Lock()
		if e, ok := f.cache[key]; ok && time.Now().Before(e.exp) {
			f.mu.Unlock()
			f.metrics.OnCacheHit(e.strategy)
			return e.np, FetchEvidence{Strategy: e.strategy, CacheHit: true}
		}
		f.mu.Unlock()

		value, _, _ := f.group.Do(key.groupKey(), func() (any, error) {
			f.mu.Lock()
			if e, ok := f.cache[key]; ok && time.Now().Before(e.exp) {
				f.mu.Unlock()
				return resolved{np: e.np, ev: FetchEvidence{Strategy: e.strategy, CacheHit: true}}, nil
			}
			f.mu.Unlock()

			start := time.Now()
			np, ev := f.resolve(ctx, streamURL, cfg, mode)
			ev.Latency = time.Since(start)

			ttl := cacheTTLSupported
			if !np.Supported {
				ttl = cacheTTLUnsupported
			}
			f.mu.Lock()
			f.cache[key] = cachedEntry{np: np, strategy: ev.Strategy, exp: time.Now().Add(ttl)}
			f.enforceCacheBound()
			f.mu.Unlock()

			f.metrics.OnFetch(ev.Strategy, np.Supported, ev.Latency)
			return resolved{np: np, ev: ev}, nil
		})
		r, _ := value.(resolved)
		if r.np == nil {
			return failureNowPlaying(), FetchEvidence{}
		}
		return r.np, r.ev
	}

	// Probe mode — no cache, no singleflight. Always upstream.
	start := time.Now()
	np, ev := f.resolve(ctx, streamURL, cfg, mode)
	ev.Latency = time.Since(start)
	f.metrics.OnFetch(ev.Strategy, np.Supported, ev.Latency)
	if ev.DelayedICY {
		f.metrics.OnDelayedDetected(streamURL)
	}
	return np, ev
}

// resolved is the singleflight payload type.
type resolved struct {
	np *NowPlaying
	ev FetchEvidence
}

func failureNowPlaying() *NowPlaying {
	return &NowPlaying{
		Source:    "",
		Supported: false,
		Status:    "error",
		ErrorCode: ErrorCodeFetch,
		Error:     "metadata fetch failed",
		FetchedAt: time.Now(),
	}
}
