package metadata

import "time"

// NowPlaying holds the extracted now-playing information for a stream. It is
// the user-facing payload — operational/diagnostic fields live on
// FetchEvidence instead.
type NowPlaying struct {
	Title       string    `json:"title"`
	Artist      string    `json:"artist,omitempty"`
	Song        string    `json:"song,omitempty"`
	Source      string    `json:"source"` // metadata source type, e.g. "icy", "icecast", "id3", "vorbis"
	MetadataURL string    `json:"metadata_url,omitempty"`
	Supported   bool      `json:"supported"` // false when no strategy found metadata
	Status      string    `json:"status"`    // "ok" | "unsupported" | "disabled" | "error"
	ErrorCode   string    `json:"error_code,omitempty"`
	Error       string    `json:"error,omitempty"`
	FetchedAt   time.Time `json:"fetched_at"`
}

// FetchEvidence carries diagnostic information about how a NowPlaying was
// obtained. It is returned alongside NowPlaying from Fetch and Probe so
// callers (poller, admin, metrics) can inspect timing and source-of-truth
// without polluting the user-facing payload.
type FetchEvidence struct {
	// DelayedICY is true when the result was obtained via the extended ICY
	// budget. The poller persists this so future Fetch calls go straight to
	// the slow budget rather than waiting for detection.
	DelayedICY bool
	// BlocksRead is the number of ICY metadata blocks consumed before a
	// non-empty StreamTitle was found. Zero for non-ICY strategies.
	BlocksRead int
	// Strategy is the source-of-truth that produced the result, e.g. "icy",
	// "icecast", "shoutcast", "cache". Empty when no result.
	Strategy string
	// Latency is the wall-clock duration of the fetch (excluding cache hits).
	Latency time.Duration
	// CacheHit is true when the value came from the in-process cache.
	CacheHit bool
}
