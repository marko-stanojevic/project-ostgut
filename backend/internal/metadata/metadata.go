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
// Results are cached per URL for 30 seconds so that concurrent player clients
// do not hammer the upstream stream.
package metadata

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	icyTimeoutFast         = 6 * time.Second  // default ICY budget for normal streams
	icyTimeoutDelayed      = 20 * time.Second // extended ICY budget for streams known to delay metadata
	fallbackTimeout        = 5 * time.Second  // budget for lightweight JSON / text endpoints
	cacheTTLSupported      = 30 * time.Second // stream returned metadata
	cacheTTLUnsupported    = 3 * time.Minute  // stream returned nothing — don't hammer it
	maxMetaint             = 65536            // reject streams with implausibly large metadata intervals
	maxICYMetadataBlocksFast = 8              // default empty/preroll tolerance before giving up
	maxICYMetadataBlocksSlow = 64             // extended empty/preroll tolerance for delayed streams
	userAgent              = "OSTGUT/1.0 (radio@worksfine.app)"
)

const (
	TypeAuto      = "auto"
	TypeICY       = "icy"
	TypeIcecast   = "icecast"
	TypeShoutcast = "shoutcast"
)

const (
	ErrorCodeDisabled = "disabled_by_admin"
	ErrorCodeNoMeta   = "no_metadata"
	ErrorCodeTimeout  = "timeout"
	ErrorCodeStatus   = "bad_status"
	ErrorCodeParse    = "parse_error"
	ErrorCodeProtocol = "protocol_error"
	ErrorCodeFetch    = "fetch_failed"
)

// Config controls how metadata should be fetched for a station.
type Config struct {
	Enabled     bool
	Type        string // auto | icy | icecast | shoutcast
	SourceHint  string // last successful source, if known
	MetadataURL string // exact successful metadata endpoint, if known
	DelayedICY  bool   // stream has previously needed the extended ICY budget
	DetectDelayedICY bool // probe mode: retry with the extended ICY budget to learn if the stream is delayed
}

// NowPlaying holds the extracted now-playing information for a stream.
type NowPlaying struct {
	Title     string    `json:"title"`
	Artist    string    `json:"artist,omitempty"`
	Song      string    `json:"song,omitempty"`
	Source    string    `json:"source"`    // "icy" | "icecast" | "shoutcast" | ""
	MetadataURL string  `json:"metadata_url,omitempty"`
	Supported bool      `json:"supported"` // false when no strategy found metadata
	Status    string    `json:"status"`    // "ok" | "unsupported" | "disabled" | "error"
	ErrorCode string    `json:"error_code,omitempty"`
	Error     string    `json:"error,omitempty"`
	DelayedICY bool     `json:"-"`
	FetchedAt time.Time `json:"fetched_at"`
}

type cachedEntry struct {
	np  *NowPlaying
	exp time.Time
}

// Fetcher fetches now-playing metadata and caches results per stream URL.
type Fetcher struct {
	// jsonClient is reused for lightweight JSON / text fallback requests.
	jsonClient *http.Client
	// icyClient is reused for ICY in-stream fetches. It has no hard timeout
	// (context deadlines control the budget) and forwards ICY headers on
	// every redirect hop. A shared client allows TCP connection reuse.
	icyClient *http.Client
	log       *slog.Logger
	mu        sync.Mutex
	cache     map[string]cachedEntry
	group     singleflight.Group
}

// NewFetcher creates a ready-to-use Fetcher and starts the cache eviction
// goroutine. The goroutine exits when the process exits.
func NewFetcher(log *slog.Logger) *Fetcher {
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
		log:   log,
		cache: make(map[string]cachedEntry),
	}
	go f.runEviction()
	return f
}

// runEviction periodically removes expired entries from the cache. It runs
// for the lifetime of the process.
func (f *Fetcher) runEviction() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		f.mu.Lock()
		for k, e := range f.cache {
			if now.After(e.exp) {
				delete(f.cache, k)
			}
		}
		f.mu.Unlock()
	}
}

// Fetch returns now-playing metadata for streamURL using a station config.
// Results are cached — 30 s when metadata was found, 3 min when nothing was found.
// Never returns nil.
func (f *Fetcher) Fetch(ctx context.Context, streamURL string, cfg Config) *NowPlaying {
	metadataType := normalizeType(cfg.Type)
	sourceHint := normalizeType(cfg.SourceHint)
	metadataURLHint := strings.TrimSpace(cfg.MetadataURL)
	cacheKey := streamURL + "|" + metadataType + "|" + strconv.FormatBool(cfg.Enabled)
	if sourceHint != "" && sourceHint != TypeAuto {
		cacheKey += "|" + sourceHint
	}
	if metadataURLHint != "" {
		cacheKey += "|" + metadataURLHint
	}
	cacheKey += "|delayed=" + strconv.FormatBool(cfg.DelayedICY)
	cacheKey += "|detect-delayed=" + strconv.FormatBool(cfg.DetectDelayedICY)

	f.mu.Lock()
	if e, ok := f.cache[cacheKey]; ok && time.Now().Before(e.exp) {
		f.mu.Unlock()
		return e.np
	}
	f.mu.Unlock()

	value, _, _ := f.group.Do(cacheKey, func() (any, error) {
		f.mu.Lock()
		if e, ok := f.cache[cacheKey]; ok && time.Now().Before(e.exp) {
			f.mu.Unlock()
			return e.np, nil
		}
		f.mu.Unlock()

		np := f.resolve(ctx, streamURL, Config{
			Enabled:          cfg.Enabled,
			Type:             metadataType,
			SourceHint:       sourceHint,
			MetadataURL:      metadataURLHint,
			DelayedICY:       cfg.DelayedICY,
			DetectDelayedICY: cfg.DetectDelayedICY,
		})

		ttl := cacheTTLSupported
		if !np.Supported {
			ttl = cacheTTLUnsupported
		}

		f.mu.Lock()
		f.cache[cacheKey] = cachedEntry{np: np, exp: time.Now().Add(ttl)}
		f.mu.Unlock()

		return np, nil
	})

	np, _ := value.(*NowPlaying)
	if np == nil {
		return &NowPlaying{
			Source:    "",
			Supported: false,
			Status:    "error",
			ErrorCode: ErrorCodeFetch,
			Error:     "metadata fetch failed",
			FetchedAt: time.Now(),
		}
	}

	return np
}

func normalizeType(raw string) string {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "", TypeAuto:
		return TypeAuto
	case TypeICY, TypeIcecast, TypeShoutcast:
		return v
	default:
		return TypeAuto
	}
}

func (f *Fetcher) resolve(ctx context.Context, streamURL string, cfg Config) *NowPlaying {
	if !cfg.Enabled {
		return &NowPlaying{
			Source:    "",
			Supported: false,
			Status:    "disabled",
			ErrorCode: ErrorCodeDisabled,
			FetchedAt: time.Now(),
		}
	}

	// PLS/M3U playlists are redirect indirection — resolve to the real stream URL
	// before attempting any ICY/Icecast/Shoutcast strategy.
	if resolved, ok := f.resolvePlaylist(ctx, streamURL); ok {
		streamURL = resolved
	}

	if hinted := strings.TrimSpace(cfg.MetadataURL); hinted != "" {
		if np := f.resolveHinted(ctx, streamURL, hinted, cfg); np != nil && np.Title != "" {
			np.Supported = true
			np.Status = "ok"
			return np
		}
	}

	if cfg.Type != TypeAuto {
		return f.resolveConfigured(ctx, streamURL, cfg)
	}

	return f.resolveAuto(ctx, streamURL, cfg)
}

func (f *Fetcher) resolveHinted(ctx context.Context, streamURL string, metadataURL string, cfg Config) *NowPlaying {
	switch hintedMetadataKind(metadataURL, cfg.SourceHint) {
	case TypeIcecast:
		iceCtx, iceCancel := context.WithTimeout(ctx, fallbackTimeout)
		np, err := f.fetchIcecastJSONAt(iceCtx, streamURL, metadataURL)
		iceCancel()
		if err == nil && np != nil && np.Title != "" {
			return np
		}
	case TypeShoutcast:
		scCtx, scCancel := context.WithTimeout(ctx, fallbackTimeout)
		np, err := f.fetchShoutcastAt(scCtx, metadataURL)
		scCancel()
		if err == nil && np != nil && np.Title != "" {
			return np
		}
	default:
		np, err := f.fetchICYAdaptive(ctx, metadataURL, cfg)
		if err == nil && np != nil && np.Title != "" {
			return np
		}
	}
	return nil
}

func (f *Fetcher) resolveAuto(ctx context.Context, streamURL string, cfg Config) *NowPlaying {
	var lastErr error

	var np *NowPlaying
	var err error

	// HLS streams can't carry ICY in-stream metadata — skip straight to the
	// server-side JSON/text endpoints which may still be available.
	if !isHLSURL(streamURL) {
		// Strategy 1: ICY in-stream via http.Client, with extended budgets only
		// for streams already known to delay metadata or for explicit detection probes.
		np, err = f.fetchICYAdaptive(ctx, streamURL, cfg)
		if err == nil && np.Title != "" {
			np.Supported = true
			np.Status = "ok"
			return np
		}
		lastErr = err
		f.log.Debug("metadata: icy http failed", "url", streamURL, "error", err)
	}

	// Strategy 2: Icecast JSON status endpoint.
	iceCtx, iceCancel := context.WithTimeout(ctx, fallbackTimeout)
	np, err = f.fetchIcecastJSON(iceCtx, streamURL)
	iceCancel()
	if err == nil && np.Title != "" {
		np.Supported = true
		np.Status = "ok"
		return np
	}
	if err != nil {
		lastErr = err
	}
	f.log.Debug("metadata: icecast json failed", "url", streamURL, "error", err)

	// Strategy 3: Shoutcast legacy text endpoints.
	scCtx, scCancel := context.WithTimeout(ctx, fallbackTimeout)
	np, err = f.fetchShoutcast(scCtx, streamURL)
	scCancel()
	if err == nil && np.Title != "" {
		np.Supported = true
		np.Status = "ok"
		return np
	}
	if err != nil {
		lastErr = err
	}
	f.log.Debug("metadata: shoutcast failed", "url", streamURL, "error", err)

	f.log.Debug("metadata: no metadata found", "url", streamURL, "last_error", lastErr)
	return &NowPlaying{Source: "", Supported: false, Status: "unsupported", ErrorCode: ErrorCodeNoMeta, FetchedAt: time.Now()}
}

func (f *Fetcher) resolveConfigured(ctx context.Context, streamURL string, cfg Config) *NowPlaying {
	var (
		np  *NowPlaying
		err error
	)

	switch cfg.Type {
	case TypeICY:
		np, err = f.fetchICYAdaptive(ctx, streamURL, cfg)
	case TypeIcecast:
		iceCtx, iceCancel := context.WithTimeout(ctx, fallbackTimeout)
		np, err = f.fetchIcecastJSON(iceCtx, streamURL)
		iceCancel()
	case TypeShoutcast:
		scCtx, scCancel := context.WithTimeout(ctx, fallbackTimeout)
		np, err = f.fetchShoutcast(scCtx, streamURL)
		scCancel()
	default:
		return f.resolveAuto(ctx, streamURL, cfg)
	}

	if err == nil && np != nil && np.Title != "" {
		np.Supported = true
		np.Status = "ok"
		return np
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
	}
}

func errorCodeFromErr(err error) string {
	if err == nil {
		return ErrorCodeNoMeta
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return ErrorCodeTimeout
	}

	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "timeout"):
		return ErrorCodeTimeout
	case strings.Contains(msg, "malformed http"), strings.Contains(msg, "bad status line"):
		return ErrorCodeProtocol
	case strings.Contains(msg, "decode"), strings.Contains(msg, "parse"), strings.Contains(msg, "unexpected /7.html format"):
		return ErrorCodeParse
	case strings.Contains(msg, "status"), strings.Contains(msg, "returned"):
		return ErrorCodeStatus
	case strings.Contains(msg, "no icy-metaint"), strings.Contains(msg, "empty metadata"):
		return ErrorCodeNoMeta
	default:
		return ErrorCodeFetch
	}
}

type icyBudget struct {
	timeout   time.Duration
	maxBlocks int
	delayed   bool
}

func icyBudgets(cfg Config) []icyBudget {
	if cfg.DelayedICY {
		return []icyBudget{{timeout: icyTimeoutDelayed, maxBlocks: maxICYMetadataBlocksSlow, delayed: true}}
	}
	budgets := []icyBudget{{timeout: icyTimeoutFast, maxBlocks: maxICYMetadataBlocksFast, delayed: false}}
	if cfg.DetectDelayedICY {
		budgets = append(budgets, icyBudget{timeout: icyTimeoutDelayed, maxBlocks: maxICYMetadataBlocksSlow, delayed: true})
	}
	return budgets
}

func shouldRetryWithDelayedBudget(err error) bool {
	if err == nil {
		return true
	}
	msg := strings.ToLower(err.Error())
	return errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) || strings.Contains(msg, "no stream title found") || strings.Contains(msg, "empty metadata") || strings.Contains(msg, "skip audio bytes") || strings.Contains(msg, "read metadata block") || strings.Contains(msg, "read meta length")
}

func (f *Fetcher) fetchICYAdaptive(ctx context.Context, streamURL string, cfg Config) (*NowPlaying, error) {
	var lastErr error
	for index, budget := range icyBudgets(cfg) {
		icyCtx, icyCancel := context.WithTimeout(ctx, budget.timeout)
		np, blocksRead, err := f.fetchICY(icyCtx, streamURL, budget.maxBlocks)
		icyCancel()
		if err == nil && np != nil && np.Title != "" {
			np.DelayedICY = budget.delayed || blocksRead > maxICYMetadataBlocksFast
			return np, nil
		}
		lastErr = err

		if isICYProtocolError(err) {
			rawCtx, rawCancel := context.WithTimeout(ctx, budget.timeout)
			npRaw, rawBlocksRead, rawErr := f.fetchICYRaw(rawCtx, streamURL, budget.maxBlocks)
			rawCancel()
			if rawErr == nil && npRaw != nil && npRaw.Title != "" {
				npRaw.DelayedICY = budget.delayed || rawBlocksRead > maxICYMetadataBlocksFast
				return npRaw, nil
			}
			lastErr = rawErr
		}

		if index == len(icyBudgets(cfg))-1 || !cfg.DetectDelayedICY || !shouldRetryWithDelayedBudget(lastErr) {
			break
		}
	}
	return nil, lastErr
}

// ---------------------------------------------------------------------------
// Strategy 1a — ICY via http.Client
// ---------------------------------------------------------------------------

func (f *Fetcher) fetchICY(ctx context.Context, streamURL string, maxBlocks int) (*NowPlaying, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, streamURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Icy-Metadata", "1")
	req.Header.Set("User-Agent", userAgent)

	resp, err := f.icyClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	metaintStr := resp.Header.Get("Icy-Metaint")
	if metaintStr == "" {
		return nil, 0, fmt.Errorf("no icy-metaint header")
	}
	metaint, err := strconv.Atoi(metaintStr)
	if err != nil || metaint <= 0 || metaint > maxMetaint {
		return nil, 0, fmt.Errorf("invalid icy-metaint: %q", metaintStr)
	}

	return f.readICYBlock(resp.Body, metaint, streamURL, maxBlocks)
}

// ---------------------------------------------------------------------------
// Strategy 1b — ICY via raw TCP (handles "ICY 200 OK" status lines)
// ---------------------------------------------------------------------------

func (f *Fetcher) fetchICYRaw(ctx context.Context, streamURL string, maxBlocks int) (*NowPlaying, int, error) {
	u, err := url.Parse(streamURL)
	if err != nil {
		return nil, 0, err
	}

	host := u.Host
	if u.Port() == "" {
		if u.Scheme == "https" {
			host = u.Hostname() + ":443"
		} else {
			host = u.Hostname() + ":80"
		}
	}

	netConn, err := (&net.Dialer{}).DialContext(ctx, "tcp", host)
	if err != nil {
		return nil, 0, fmt.Errorf("dial: %w", err)
	}

	var conn net.Conn = netConn
	if u.Scheme == "https" {
		tlsConn := tls.Client(netConn, &tls.Config{ServerName: u.Hostname()})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			netConn.Close()
			return nil, 0, fmt.Errorf("tls handshake: %w", err)
		}
		conn = tlsConn
	}
	defer conn.Close()

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	// Send an HTTP/1.0 request. Many ICY servers require HTTP/1.0 or refuse
	// keep-alive, so we use HTTP/1.0 + Connection: close explicitly.
	_, err = fmt.Fprintf(conn,
		"GET %s HTTP/1.0\r\nHost: %s\r\nIcy-Metadata: 1\r\nUser-Agent: %s\r\nConnection: close\r\n\r\n",
		u.RequestURI(), u.Hostname(), userAgent,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("write request: %w", err)
	}

	r := bufio.NewReader(conn)

	// Read and accept both "HTTP/1.x 200 OK" and "ICY 200 OK" status lines.
	statusLine, err := r.ReadString('\n')
	if err != nil {
		return nil, 0, fmt.Errorf("read status line: %w", err)
	}
	statusLine = strings.TrimRight(statusLine, "\r\n")
	if !strings.Contains(statusLine, " 200") {
		return nil, 0, fmt.Errorf("non-200 status: %q", statusLine)
	}

	// Read response headers until blank line.
	var metaintStr string
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, 0, fmt.Errorf("read headers: %w", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		if idx := strings.IndexByte(line, ':'); idx != -1 {
			k := strings.ToLower(strings.TrimSpace(line[:idx]))
			v := strings.TrimSpace(line[idx+1:])
			if k == "icy-metaint" {
				metaintStr = v
			}
		}
	}

	if metaintStr == "" {
		return nil, 0, fmt.Errorf("no icy-metaint in raw response")
	}
	metaint, err := strconv.Atoi(metaintStr)
	if err != nil || metaint <= 0 || metaint > maxMetaint {
		return nil, 0, fmt.Errorf("invalid icy-metaint: %q", metaintStr)
	}

	return f.readICYBlock(r, metaint, streamURL, maxBlocks)
}

// readICYBlock skips `metaint` audio bytes and scans a few metadata blocks so
// preroll ads or empty blocks do not mask a later real track title.
func (f *Fetcher) readICYBlock(r io.Reader, metaint int, streamURL string, maxBlocks int) (*NowPlaying, int, error) {
	for attempt := 0; attempt < maxBlocks; attempt++ {
		if _, err := io.CopyN(io.Discard, r, int64(metaint)); err != nil {
			return nil, attempt, fmt.Errorf("skip audio bytes: %w", err)
		}

		// 1-byte length field; actual block size = value × 16.
		var lenBuf [1]byte
		if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
			return nil, attempt, fmt.Errorf("read meta length byte: %w", err)
		}
		metaLen := int(lenBuf[0]) * 16
		if metaLen == 0 {
			f.log.Debug("metadata: icy block empty", "url", streamURL, "attempt", attempt+1)
			continue
		}

		metaBuf := make([]byte, metaLen)
		if _, err := io.ReadFull(r, metaBuf); err != nil {
			return nil, attempt + 1, fmt.Errorf("read metadata block: %w", err)
		}

		raw := strings.TrimRight(string(metaBuf), "\x00")
		title := extractICYField(raw, "StreamTitle")
		title = normalizeMetadataTitle(title)
		f.log.Debug("metadata: icy block content", "url", streamURL, "attempt", attempt+1, "raw", raw, "title", title)
		if isPlaceholderTitle(title) {
			title = ""
		}
		if title == "" {
			continue
		}

		np := &NowPlaying{
			Title:       title,
			Source:      "icy",
			MetadataURL: streamURL,
			FetchedAt:   time.Now(),
		}
		np.Artist, np.Song = splitArtistTitle(title)
		return np, attempt + 1, nil
	}

	return nil, maxBlocks, fmt.Errorf("no stream title found in %d icy blocks", maxBlocks)
}

// ---------------------------------------------------------------------------
// Strategy 2 — Icecast JSON status endpoint
// ---------------------------------------------------------------------------

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
		return nil, err
	}

	statusURL := (&url.URL{Scheme: u.Scheme, Host: u.Host, Path: "/status-json.xsl"}).String()
	return f.fetchIcecastJSONAt(ctx, streamURL, statusURL)
}

func (f *Fetcher) fetchIcecastJSONAt(ctx context.Context, streamURL string, statusURL string) (*NowPlaying, error) {
	u, err := url.Parse(streamURL)
	if err != nil {
		return nil, err
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
		return nil, fmt.Errorf("icecast status %d", resp.StatusCode)
	}

	var ice icecastResponse
	if err := json.NewDecoder(resp.Body).Decode(&ice); err != nil {
		return nil, fmt.Errorf("decode icecast json: %w", err)
	}
	if len(ice.Icestats.Source) == 0 {
		return nil, fmt.Errorf("no sources in icecast response")
	}

	// The source field is a single object when there is one mount point and an
	// array when there are multiple. Try array first, fall back to object.
	var sources []icecastSource
	if err := json.Unmarshal(ice.Icestats.Source, &sources); err != nil {
		var single icecastSource
		if err2 := json.Unmarshal(ice.Icestats.Source, &single); err2 != nil {
			return nil, fmt.Errorf("parse icecast sources: %w", err)
		}
		sources = []icecastSource{single}
	}
	if len(sources) == 0 {
		return nil, fmt.Errorf("empty sources array")
	}

	// Prefer the source whose mount path matches the stream URL path.
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
		return nil, fmt.Errorf("no title in icecast source")
	}
	title := normalizeMetadataTitle(best.Title)

	np := &NowPlaying{
		Title:     title,
		Source:    "icecast",
		MetadataURL: statusURL,
		FetchedAt: time.Now(),
	}
	np.Artist, np.Song = splitArtistTitle(title)
	return np, nil
}

// ---------------------------------------------------------------------------
// Strategy 3 — Shoutcast legacy endpoints
// ---------------------------------------------------------------------------

func (f *Fetcher) fetchShoutcast(ctx context.Context, streamURL string) (*NowPlaying, error) {
	u, err := url.Parse(streamURL)
	if err != nil {
		return nil, err
	}
	base := (&url.URL{Scheme: u.Scheme, Host: u.Host}).String()

	// Shoutcast 2: /currentsong returns plain-text "Artist - Title".
	if np, err := f.fetchShoutcastCurrentSong(ctx, base+"/currentsong"); err == nil && np.Title != "" {
		return np, nil
	}

	// Shoutcast 1: /7.html returns a comma-separated line inside an HTML body.
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
		return nil, fmt.Errorf("unsupported shoutcast endpoint")
	}
}

func (f *Fetcher) fetchShoutcastCurrentSong(ctx context.Context, endpoint string) (*NowPlaying, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
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
		return nil, fmt.Errorf("shoutcast /currentsong returned %d", resp.StatusCode)
	}

	b, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return nil, err
	}
	title := normalizeMetadataTitle(string(b))
	if isPlaceholderTitle(title) {
		return nil, fmt.Errorf("empty shoutcast /currentsong body")
	}

	np := &NowPlaying{Title: title, Source: "shoutcast", MetadataURL: endpoint, FetchedAt: time.Now()}
	np.Artist, np.Song = splitArtistTitle(title)
	return np, nil
}

func (f *Fetcher) fetchShoutcast7HTML(ctx context.Context, endpoint string) (*NowPlaying, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
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
		return nil, fmt.Errorf("shoutcast /7.html returned %d", resp.StatusCode)
	}

	b, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return nil, err
	}

	// Strip HTML tags to isolate the body text, then parse the CSV line.
	// Shoutcast 1 format: CurrentListeners,StreamStatus,PeakListeners,
	//                     MaxListeners,UniqueListeners,Bitrate,SongTitle
	text := stripHTML(string(b))
	// Use SplitN with n=7 so commas inside the song title are preserved.
	parts := strings.SplitN(text, ",", 7)
	if len(parts) < 7 {
		return nil, fmt.Errorf("unexpected /7.html format: %q", text)
	}
	title := normalizeMetadataTitle(parts[6])
	if isPlaceholderTitle(title) {
		return nil, fmt.Errorf("empty title in /7.html")
	}

	np := &NowPlaying{Title: title, Source: "shoutcast", MetadataURL: endpoint, FetchedAt: time.Now()}
	np.Artist, np.Song = splitArtistTitle(title)
	return np, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// extractICYField parses a named value from an ICY metadata string.
//
// ICY format: StreamTitle='value';StreamUrl='value';
// The spec mandates "';'" as the terminator, but some servers omit the
// semicolon on the last field, so we fall back to the last single-quote.
func extractICYField(meta, key string) string {
	prefix := key + "='"
	idx := strings.Index(meta, prefix)
	if idx == -1 {
		return ""
	}
	rest := meta[idx+len(prefix):]
	if end := strings.Index(rest, "';"); end != -1 {
		return rest[:end]
	}
	if end := strings.LastIndex(rest, "'"); end != -1 {
		return rest[:end]
	}
	return rest
}

func normalizeMetadataTitle(s string) string {
	s = strings.TrimSpace(s)
	for {
		trimmed := false
		for _, suffix := range []string{" -", " –", " —"} {
			if strings.HasSuffix(s, suffix) {
				s = strings.TrimSpace(strings.TrimSuffix(s, suffix))
				trimmed = true
				break
			}
		}
		if !trimmed {
			return s
		}
	}
}

// splitArtistTitle splits "Artist - Title" into its components.
// Returns ("", fullTitle) when no recognised delimiter is found.
func splitArtistTitle(s string) (artist, song string) {
	s = normalizeMetadataTitle(s)
	if parsedArtist, parsedSong, ok := parseQuotedBylineTitle(s); ok {
		return parsedArtist, parsedSong
	}
	for _, sep := range []string{" - ", " – ", " — "} {
		if idx := strings.Index(s, sep); idx != -1 {
			return strings.TrimSpace(s[:idx]), strings.TrimSpace(s[idx+len(sep):])
		}
	}
	return "", s
}

func parseQuotedBylineTitle(s string) (artist, song string, ok bool) {
	for _, quote := range []string{"\"", "“", "'"} {
		if !strings.HasPrefix(s, quote) {
			continue
		}

		rest := s[len(quote):]
		end := strings.Index(rest, quote)
		if end == -1 {
			continue
		}

		song = strings.TrimSpace(rest[:end])
		if song == "" {
			continue
		}

		byline := strings.TrimSpace(rest[end+len(quote):])
		if len(byline) < 3 || !strings.EqualFold(byline[:3], "by ") {
			continue
		}

		artist = strings.TrimSpace(byline[3:])
		if idx := strings.Index(strings.ToLower(artist), " on "); idx != -1 {
			artist = strings.TrimSpace(artist[:idx])
		}
		if artist == "" {
			continue
		}

		return artist, song, true
	}

	return "", "", false
}

// stripHTML removes HTML tags and decodes common HTML entities.
func stripHTML(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	result := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#039;", "'",
	).Replace(b.String())
	return strings.TrimSpace(result)
}

func hintedMetadataKind(metadataURL string, sourceHint string) string {
	switch normalizeType(sourceHint) {
	case TypeICY, TypeIcecast, TypeShoutcast:
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

// isHLSURL reports whether a URL points to an HLS stream (.m3u8).
func isHLSURL(u string) bool {
	lower := strings.ToLower(u)
	// Strip query string before checking extension.
	if idx := strings.IndexByte(lower, '?'); idx != -1 {
		lower = lower[:idx]
	}
	return strings.HasSuffix(lower, ".m3u8")
}

// resolvePlaylist detects PLS and M3U playlist URLs and returns the first
// stream URL found inside. Returns ("", false) when the URL is not a playlist
// or resolution fails — the caller should proceed with the original URL.
func (f *Fetcher) resolvePlaylist(ctx context.Context, rawURL string) (string, bool) {
	lower := strings.ToLower(rawURL)
	// Strip query string before checking extension.
	lowerPath := lower
	if idx := strings.IndexByte(lowerPath, '?'); idx != -1 {
		lowerPath = lowerPath[:idx]
	}
	isPLS := strings.HasSuffix(lowerPath, ".pls")
	isM3U := strings.HasSuffix(lowerPath, ".m3u")
	if !isPLS && !isM3U {
		return "", false
	}

	reqCtx, cancel := context.WithTimeout(ctx, fallbackTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", false
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := f.jsonClient.Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", false
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return "", false
	}
	text := string(body)

	if isPLS {
		return parsePLS(text)
	}
	return parseM3U(text)
}

// parsePLS extracts the first File entry from a PLS playlist.
func parsePLS(text string) (string, bool) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		// Match File1=, File2=, … (case-insensitive)
		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "file") {
			if idx := strings.IndexByte(line, '='); idx != -1 {
				u := strings.TrimSpace(line[idx+1:])
				if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
					return u, true
				}
			}
		}
	}
	return "", false
}

// parseM3U extracts the first non-comment URL from an M3U/M3U8 playlist.
func parseM3U(text string) (string, bool) {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "http://") || strings.HasPrefix(line, "https://") {
			return line, true
		}
	}
	return "", false
}

// isPlaceholderTitle reports whether a title string is a known placeholder
// value that should be treated as no metadata (e.g. "-", ".", "N/A").
func isPlaceholderTitle(s string) bool {
	s = strings.TrimSpace(s)
	switch s {
	case "", "-", "--", "---", ".", "..", "N/A", "n/a", "NA", "null", "undefined", "unknown":
		return true
	}
	return false
}

// isICYProtocolError reports whether err stems from a server that sent an
// "ICY 200 OK" status line, which Go's net/http parser cannot handle.
func isICYProtocolError(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, `malformed HTTP version "ICY"`) ||
		strings.Contains(s, "malformed HTTP response") ||
		strings.Contains(s, "bad status line")
}
