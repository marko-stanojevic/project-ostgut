package metadata

import "time"

// Metrics is a narrow observability hook so callers can wire fetcher activity
// into Prometheus, expvar, OpenTelemetry, etc. without coupling this package
// to any particular metrics library. Default implementation is a no-op.
type Metrics interface {
	// OnFetch is called once per terminal Fetch/Probe outcome (cache hits and
	// upstream calls both count). strategy is "cache" for cached results,
	// otherwise the source-of-truth that produced the title; "" when nothing
	// was found.
	OnFetch(strategy string, ok bool, latency time.Duration)
	// OnDelayedDetected is called when the extended ICY budget produced a
	// title that the fast budget did not. Used to populate the admin
	// "delayed metadata watchlist".
	OnDelayedDetected(streamURL string)
	// OnCacheHit is called for every cache hit; strategy is the original
	// source-of-truth that filled the cache entry.
	OnCacheHit(strategy string)
}

type nopMetrics struct{}

func (nopMetrics) OnFetch(string, bool, time.Duration) {}
func (nopMetrics) OnDelayedDetected(string)            {}
func (nopMetrics) OnCacheHit(string)                   {}
