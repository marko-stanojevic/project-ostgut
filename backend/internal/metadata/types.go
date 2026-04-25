// Package metadata fetches "now playing" track information from internet radio
// streams. It tries multiple strategies in order until one returns a non-empty
// title:
//
//  1. ICY in-stream metadata via HTTP (Icecast 2+, modern Shoutcast 2)
//  2. ICY via raw TCP (legacy Shoutcast 1 servers that return "ICY 200 OK"
//     status lines, which Go's net/http cannot parse)
//  3. Icecast JSON status endpoint  (/status-json.xsl)
//  4. Shoutcast text endpoints      (/currentsong, /7.html)
//
// Results are cached per URL for 30 seconds so concurrent player clients do
// not hammer the upstream stream.
//
// Two entry points exist:
//
//   - Fetch  — runtime path used by the SSE poller; uses the cache and respects
//     the persisted DelayedICY flag.
//   - Probe  — admin/diagnostic path; bypasses the cache and always tries the
//     extended ICY budget so the system can learn whether a stream is delayed.
//
// Both return a *NowPlaying plus a FetchEvidence describing how the result was
// obtained (delayed budget, blocks read, strategy, latency).
package metadata

import "time"

const (
	icyTimeoutFast           = 6 * time.Second  // default ICY budget for normal streams
	icyTimeoutDelayed        = 20 * time.Second // extended ICY budget for streams known to delay metadata
	fallbackTimeout          = 5 * time.Second  // budget for lightweight JSON / text endpoints
	cacheTTLSupported        = 30 * time.Second // stream returned metadata
	cacheTTLUnsupported      = 3 * time.Minute  // stream returned nothing — don't hammer it
	maxMetaint               = 65536            // reject streams with implausibly large metadata intervals
	maxICYMetadataBlocksFast = 8                // default empty/preroll tolerance before giving up
	maxICYMetadataBlocksSlow = 64               // extended empty/preroll tolerance for delayed streams
	defaultMaxCacheEntries   = 4096             // upper bound on in-process cache size
	userAgent                = "OSTGUT/1.0 (radio@worksfine.app)"
)

// MetadataWaitSeconds returns the server-side ICY metadata wait budget the
// fetcher will apply for a stream, in whole seconds. Exposed so the API can
// surface this to clients without hard-coding the constant on the frontend.
func MetadataWaitSeconds(delayed bool) int {
	if delayed {
		return int(icyTimeoutDelayed / time.Second)
	}
	return int(icyTimeoutFast / time.Second)
}

// Strategy types used by Config.Type, NowPlaying.Source and FetchEvidence.Strategy.
const (
	TypeAuto      = "auto"
	TypeICY       = "icy"
	TypeIcecast   = "icecast"
	TypeShoutcast = "shoutcast"
)

// Public error codes returned in NowPlaying.ErrorCode.
const (
	ErrorCodeDisabled = "disabled_by_admin"
	ErrorCodeNoMeta   = "no_metadata"
	ErrorCodeTimeout  = "timeout"
	ErrorCodeStatus   = "bad_status"
	ErrorCodeParse    = "parse_error"
	ErrorCodeProtocol = "protocol_error"
	ErrorCodeFetch    = "fetch_failed"
)
