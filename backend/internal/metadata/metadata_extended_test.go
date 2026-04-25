package metadata

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Pure helpers — normalizeType, hintedMetadataKind, isHLSURL
// ---------------------------------------------------------------------------

func TestNormalizeType(t *testing.T) {
	cases := map[string]string{
		"":            TypeAuto,
		"AUTO":        TypeAuto,
		"  auto  ":    TypeAuto,
		"icy":         TypeICY,
		"ICY":         TypeICY,
		"icecast":     TypeIcecast,
		"shoutcast":   TypeShoutcast,
		"nonsense":    TypeAuto,
		"icyx":        TypeAuto,
		"  shoutcast": TypeShoutcast,
	}
	for in, want := range cases {
		if got := normalizeType(in); got != want {
			t.Errorf("normalizeType(%q) = %q; want %q", in, got, want)
		}
	}
}

func TestHintedMetadataKind(t *testing.T) {
	cases := []struct {
		url, hint, want string
	}{
		// Hint wins when it is a recognised type.
		{"http://x/foo", "icy", TypeICY},
		{"http://x/foo", "ICECAST", TypeIcecast},
		{"http://x/foo", "shoutcast", TypeShoutcast},
		// No hint — derive from URL suffix.
		{"http://x/status-json.xsl", "", TypeIcecast},
		{"http://x/currentsong", "", TypeShoutcast},
		{"http://x/7.html", "", TypeShoutcast},
		// Unknown URL falls through to ICY.
		{"http://x/stream.mp3", "", TypeICY},
		// Garbage hint is treated as no hint.
		{"http://x/status-json.xsl", "garbage", TypeIcecast},
	}
	for _, tc := range cases {
		if got := hintedMetadataKind(tc.url, tc.hint); got != tc.want {
			t.Errorf("hintedMetadataKind(%q, %q) = %q; want %q", tc.url, tc.hint, got, tc.want)
		}
	}
}

func TestIsHLSURL(t *testing.T) {
	cases := map[string]bool{
		"http://x/live.m3u8":           true,
		"https://x/live.M3U8":          true,
		"http://x/live.m3u8?token=abc": true,
		"http://x/live.mp3":            false,
		"http://x/live.m3u":            false, // M3U playlist, not HLS
		"http://x/live":                false,
		"http://x/live.m3u8/extra":     false,
	}
	for in, want := range cases {
		if got := isHLSURL(in); got != want {
			t.Errorf("isHLSURL(%q) = %v; want %v", in, got, want)
		}
	}
}

// ---------------------------------------------------------------------------
// Playlist parsers — direct, no HTTP
// ---------------------------------------------------------------------------

func TestParsePLS(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
		ok   bool
	}{
		{"basic CRLF", "[playlist]\r\nFile1=http://example.com/a.mp3\r\nLength1=-1\r\n", "http://example.com/a.mp3", true},
		{"prefers first File", "[playlist]\r\nFile2=http://b/b.mp3\r\nFile1=http://a/a.mp3\r\n", "http://b/b.mp3", true},
		{"non-http file ignored", "File1=/local/path.mp3\nFile2=http://x/y.mp3\n", "http://x/y.mp3", true},
		{"empty", "", "", false},
		{"no File entries", "[playlist]\nNumberOfEntries=0\n", "", false},
	}
	for _, tc := range cases {
		got, ok := parsePLS(tc.in)
		if ok != tc.ok || got != tc.want {
			t.Errorf("%s: parsePLS = (%q, %v); want (%q, %v)", tc.name, got, ok, tc.want, tc.ok)
		}
	}
}

func TestParseM3U(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
		ok   bool
	}{
		{"basic CRLF", "#EXTM3U\r\n#EXTINF:-1\r\nhttp://x/a.mp3\r\n", "http://x/a.mp3", true},
		{"first non-comment URL wins", "#EXTM3U\nhttp://first/a.mp3\nhttp://second/b.mp3\n", "http://first/a.mp3", true},
		{"all comments", "#EXTM3U\n#EXTINF:0\n", "", false},
		{"non-http line skipped", "/local/file.mp3\nhttp://x/y.mp3\n", "http://x/y.mp3", true},
		{"empty", "", "", false},
	}
	for _, tc := range cases {
		got, ok := parseM3U(tc.in)
		if ok != tc.ok || got != tc.want {
			t.Errorf("%s: parseM3U = (%q, %v); want (%q, %v)", tc.name, got, ok, tc.want, tc.ok)
		}
	}
}

// ---------------------------------------------------------------------------
// ICY budget policy — pure, table driven
// ---------------------------------------------------------------------------

func TestICYBudgets(t *testing.T) {
	cases := []struct {
		name     string
		cfg      Config
		mode     fetchMode
		wantLen  int
		lastSlow bool
	}{
		{"runtime, not delayed", Config{}, modeRuntime, 1, false},
		{"runtime, delayed", Config{DelayedICY: true}, modeRuntime, 1, true},
		{"probe, not delayed", Config{}, modeProbe, 2, true},
		{"probe, delayed", Config{DelayedICY: true}, modeProbe, 1, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			b := icyBudgets(tc.cfg, tc.mode)
			if len(b) != tc.wantLen {
				t.Fatalf("len = %d; want %d", len(b), tc.wantLen)
			}
			if b[len(b)-1].delayed != tc.lastSlow {
				t.Fatalf("last budget delayed = %v; want %v", b[len(b)-1].delayed, tc.lastSlow)
			}
			// First budget must always be fast unless DelayedICY is true.
			if !tc.cfg.DelayedICY && b[0].timeout != icyTimeoutFast {
				t.Fatalf("first budget timeout = %v; want %v", b[0].timeout, icyTimeoutFast)
			}
		})
	}
}

func TestShouldRetryWithDelayedBudget(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{nil, true},
		{context.DeadlineExceeded, true},
		{context.Canceled, true},
		{fmt.Errorf("wrap: %w", ErrNoStreamTitle), true},
		{fmt.Errorf("wrap: %w", ErrEmptyMetadata), true},
		{fmt.Errorf("wrap: %w", ErrICYRead), true},
		// Non-recoverable: protocol or upstream-status errors do not improve
		// with a longer budget.
		{fmt.Errorf("wrap: %w", ErrICYProtocol), false},
		{fmt.Errorf("wrap: %w", ErrUpstreamStatus), false},
		{fmt.Errorf("wrap: %w", ErrNoMetaint), false},
		{errors.New("dial tcp: connection refused"), false},
	}
	for _, tc := range cases {
		if got := shouldRetryWithDelayedBudget(tc.err); got != tc.want {
			t.Errorf("shouldRetryWithDelayedBudget(%v) = %v; want %v", tc.err, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// fetchICY error paths — header validation and status
// ---------------------------------------------------------------------------

func TestFetchICYNoMetaintHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// No Icy-Metaint header at all.
		w.Write([]byte("audio bytes"))
	}))
	defer srv.Close()

	f := newFetcher(t)
	_, _, err := f.fetchICY(t.Context(), srv.URL, maxICYMetadataBlocksFast)
	if !errors.Is(err, ErrNoMetaint) {
		t.Fatalf("got err %v; want ErrNoMetaint", err)
	}
}

func TestFetchICYInvalidMetaint(t *testing.T) {
	cases := map[string]string{
		"non-numeric":    "abc",
		"zero":           "0",
		"negative":       "-1",
		"absurdly large": strconv.Itoa(maxMetaint + 1),
	}
	for name, headerVal := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Icy-Metaint", headerVal)
				w.Write([]byte("audio"))
			}))
			defer srv.Close()

			f := newFetcher(t)
			_, _, err := f.fetchICY(t.Context(), srv.URL, maxICYMetadataBlocksFast)
			if !errors.Is(err, ErrInvalidMetaint) {
				t.Fatalf("header %q: got err %v; want ErrInvalidMetaint", headerVal, err)
			}
		})
	}
}

func TestFetchICYNon200Status(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	f := newFetcher(t)
	_, _, err := f.fetchICY(t.Context(), srv.URL, maxICYMetadataBlocksFast)
	if !errors.Is(err, ErrUpstreamStatus) {
		t.Fatalf("got err %v; want ErrUpstreamStatus", err)
	}
}

// ---------------------------------------------------------------------------
// resolveAuto — fallback ladder
// ---------------------------------------------------------------------------

// When ICY returns no metaint header, the fallback strategies (Icecast JSON
// and Shoutcast text) race; whichever has a usable payload wins.
func TestFetchAutoFallsBackToIcecastWhenICYHasNoMetaint(t *testing.T) {
	var icyHits, iceHits, scHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/stream":
			atomic.AddInt32(&icyHits, 1)
			// Respond as an ordinary audio stream with no Icy-Metaint header
			// so ICY strategy fails with ErrNoMetaint.
			w.Write([]byte("audio"))
		case "/status-json.xsl":
			atomic.AddInt32(&iceHits, 1)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"icestats":{"source":{"title":"Fallback Win - Track","mount":"/stream"}}}`))
		case "/currentsong", "/7.html":
			atomic.AddInt32(&scHits, 1)
			http.NotFound(w, r)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, ev := f.Fetch(t.Context(), srv.URL+"/stream", Config{Enabled: true, Type: TypeAuto})
	if np.Status != "ok" || ev.Strategy != TypeIcecast {
		t.Fatalf("got %+v ev=%+v", np, ev)
	}
	if atomic.LoadInt32(&icyHits) == 0 {
		t.Errorf("expected ICY to be tried first")
	}
	if atomic.LoadInt32(&iceHits) == 0 {
		t.Errorf("expected icecast to be tried as fallback")
	}
}

// When all strategies fail, resolveAuto returns an unsupported NowPlaying
// with ErrorCodeNoMeta — not an ErrorCodeFetch.
func TestFetchAutoUnsupportedWhenAllFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Every endpoint returns 404.
		http.NotFound(w, r)
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, ev := f.Fetch(t.Context(), srv.URL+"/stream", Config{Enabled: true, Type: TypeAuto})
	if np.Status != "unsupported" {
		t.Fatalf("got status %q; want unsupported (%+v)", np.Status, np)
	}
	if np.ErrorCode != ErrorCodeNoMeta {
		t.Errorf("got error code %q; want %q", np.ErrorCode, ErrorCodeNoMeta)
	}
	if ev.Strategy != "" {
		t.Errorf("got strategy %q; want empty for unsupported", ev.Strategy)
	}
}

// ---------------------------------------------------------------------------
// Hinted MetadataURL routing — direct dispatch instead of strategy ladder
// ---------------------------------------------------------------------------

// When a station has a known Icecast metadata URL, the hinted path must call
// it directly without spinning up the ICY ladder first.
func TestFetchHintedIcecastSkipsLadder(t *testing.T) {
	var icyHits, iceHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/stream":
			atomic.AddInt32(&icyHits, 1)
			w.Write([]byte("audio"))
		case "/status-json.xsl":
			atomic.AddInt32(&iceHits, 1)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"icestats":{"source":{"title":"Hinted - Track","mount":"/stream"}}}`))
		}
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, ev := f.Fetch(t.Context(), srv.URL+"/stream", Config{
		Enabled:     true,
		Type:        TypeAuto,
		MetadataURL: srv.URL + "/status-json.xsl",
	})
	if np.Title != "Hinted - Track" || ev.Strategy != TypeIcecast {
		t.Fatalf("got %+v ev=%+v", np, ev)
	}
	if atomic.LoadInt32(&icyHits) != 0 {
		t.Errorf("expected hinted path to bypass ICY; got %d ICY hits", icyHits)
	}
	if atomic.LoadInt32(&iceHits) != 1 {
		t.Errorf("expected exactly 1 icecast hit; got %d", iceHits)
	}
}

// Shoutcast hint: /currentsong endpoint.
func TestFetchHintedShoutcastCurrentsong(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/currentsong" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte("Boards of Canada - Roygbiv"))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, ev := f.Fetch(t.Context(), srv.URL+"/stream", Config{
		Enabled:     true,
		Type:        TypeAuto,
		MetadataURL: srv.URL + "/currentsong",
	})
	if np.Title != "Boards of Canada - Roygbiv" || ev.Strategy != TypeShoutcast {
		t.Fatalf("got %+v ev=%+v", np, ev)
	}
}

// ---------------------------------------------------------------------------
// fetchShoutcastAt dispatch
// ---------------------------------------------------------------------------

func TestFetchShoutcastAtUnsupportedEndpoint(t *testing.T) {
	f := newFetcher(t)
	_, err := f.fetchShoutcastAt(t.Context(), "http://example.com/nope")
	if !errors.Is(err, ErrUnsupported) {
		t.Fatalf("got err %v; want ErrUnsupported", err)
	}
}

func TestFetchShoutcastAtDispatches7HTML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/7.html" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte("<html><body>1,1,5,100,1,128,Some - Track</body></html>"))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, err := f.fetchShoutcastAt(t.Context(), srv.URL+"/7.html")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if np.Title != "Some - Track" {
		t.Errorf("got title %q", np.Title)
	}
}

// ---------------------------------------------------------------------------
// Probe vs Fetch — caching contract
// ---------------------------------------------------------------------------

// Probe must always reach the upstream; consecutive Probes do not return a
// cached response.
func TestProbeBypassesCache(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"Probe - Track","mount":"/s"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	cfg := Config{Enabled: true, Type: TypeIcecast}

	for i := 0; i < 3; i++ {
		np, ev := f.Probe(t.Context(), srv.URL+"/s", cfg)
		if np.Title == "" {
			t.Fatalf("probe %d: empty title", i)
		}
		if ev.CacheHit {
			t.Fatalf("probe %d: unexpected cache hit", i)
		}
	}
	if got := atomic.LoadInt32(&hits); got != 3 {
		t.Fatalf("expected 3 upstream calls, got %d", got)
	}
}

// Fetch must populate the cache so a follow-up Fetch returns a cache hit
// without touching the upstream.
func TestFetchPopulatesCache(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"Cache Me - Track","mount":"/s"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	cfg := Config{Enabled: true, Type: TypeIcecast}
	streamURL := srv.URL + "/s"

	first, ev1 := f.Fetch(t.Context(), streamURL, cfg)
	second, ev2 := f.Fetch(t.Context(), streamURL, cfg)

	if first.Title != second.Title {
		t.Errorf("titles diverged: %q vs %q", first.Title, second.Title)
	}
	if ev1.CacheHit {
		t.Errorf("first fetch should miss cache")
	}
	if !ev2.CacheHit {
		t.Errorf("second fetch should hit cache; ev=%+v", ev2)
	}
	if got := atomic.LoadInt32(&hits); got != 1 {
		t.Errorf("expected 1 upstream call; got %d", got)
	}
}

// ---------------------------------------------------------------------------
// Evidence / observability
// ---------------------------------------------------------------------------

func TestFetchEvidenceLatency(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(10 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"Latency - Track","mount":"/s"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	_, ev := f.Fetch(t.Context(), srv.URL+"/s", Config{Enabled: true, Type: TypeIcecast})
	if ev.Latency <= 0 {
		t.Fatalf("expected positive latency; got %v", ev.Latency)
	}
	if ev.CacheHit {
		t.Fatalf("first fetch should not be a cache hit")
	}
}

// Cache hits report CacheHit=true and zero latency — consumers rely on this
// to distinguish "served from memory" from "served via upstream".
func TestFetchEvidenceCacheHitHasZeroLatency(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"X - Y","mount":"/s"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	cfg := Config{Enabled: true, Type: TypeIcecast}
	f.Fetch(t.Context(), srv.URL+"/s", cfg)
	_, ev := f.Fetch(t.Context(), srv.URL+"/s", cfg)
	if !ev.CacheHit {
		t.Fatalf("expected cache hit on second call")
	}
	if ev.Latency != 0 {
		t.Errorf("cache hit must report zero latency; got %v", ev.Latency)
	}
}

// ---------------------------------------------------------------------------
// Cache TTL — unsupported entries get a long TTL so we don't hammer dead streams
// ---------------------------------------------------------------------------

func TestUnsupportedResultGetsLongTTL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer srv.Close()

	f := newFetcher(t)
	cfg := Config{Enabled: true, Type: TypeAuto}
	streamURL := srv.URL + "/dead"

	before := time.Now()
	f.Fetch(t.Context(), streamURL, cfg)

	f.mu.Lock()
	defer f.mu.Unlock()
	entry, ok := f.cache[cfg.cacheKey(streamURL)]
	if !ok {
		t.Fatalf("expected cache entry for unsupported result")
	}
	gotTTL := entry.exp.Sub(before)
	// Allow a generous lower bound (90% of the configured TTL) to account for
	// scheduling delay between Now() in the fetcher and Now() here.
	minTTL := cacheTTLUnsupported - 30*time.Second
	if gotTTL < minTTL {
		t.Fatalf("unsupported TTL = %v; want >= %v", gotTTL, minTTL)
	}
}

// ---------------------------------------------------------------------------
// enforceCacheBound triggers automatically on insert
// ---------------------------------------------------------------------------

func TestFetchTriggersCacheBound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"icestats":{"source":{"title":"T-%s","mount":"%s"}}}`, r.URL.Path, r.URL.Path)
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default(), WithMaxCacheEntries(2))
	t.Cleanup(func() { _ = f.Close() })

	cfg := Config{Enabled: true, Type: TypeIcecast}
	for i := 0; i < 5; i++ {
		f.Fetch(t.Context(), fmt.Sprintf("%s/s%d", srv.URL, i), cfg)
	}

	f.mu.Lock()
	got := len(f.cache)
	f.mu.Unlock()
	if got > 2 {
		t.Fatalf("cache size = %d; want <= 2 (max enforced via Fetch)", got)
	}
}

// ---------------------------------------------------------------------------
// Metrics — Probe records DelayedICY events
// ---------------------------------------------------------------------------

func TestProbeRecordsDelayedDetectedMetric(t *testing.T) {
	const metaint = 64
	delayedTitle := "Delayed - Track"

	body := ""
	for i := 0; i < maxICYMetadataBlocksFast; i++ {
		body += repeatString("a", metaint) + padICYBlock("StreamTitle='';")
	}
	body += repeatString("b", metaint) + padICYBlock("StreamTitle='"+delayedTitle+"';")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Icy-Metaint", strconv.Itoa(metaint))
		w.Write([]byte(body))
	}))
	defer srv.Close()

	m := &recordingMetrics{}
	f := NewFetcher(slog.Default(), WithMetrics(m))
	t.Cleanup(func() { _ = f.Close() })

	np, ev := f.Probe(t.Context(), srv.URL, Config{Enabled: true, Type: TypeICY})
	if np.Title != delayedTitle || !ev.DelayedICY {
		t.Fatalf("expected delayed result; got np=%+v ev=%+v", np, ev)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.delayed != 1 {
		t.Fatalf("expected OnDelayedDetected fired once; got %d", m.delayed)
	}
}

// repeatString avoids importing "strings" twice in this file.
func repeatString(s string, n int) string {
	out := make([]byte, 0, len(s)*n)
	for i := 0; i < n; i++ {
		out = append(out, s...)
	}
	return string(out)
}

// ---------------------------------------------------------------------------
// extractICYField — multi-key extraction
// ---------------------------------------------------------------------------

func TestExtractICYFieldMultipleKeys(t *testing.T) {
	meta := "StreamTitle='Massive Attack - Teardrop';StreamUrl='http://example.com/info';"
	if got := extractICYField(meta, "StreamTitle"); got != "Massive Attack - Teardrop" {
		t.Errorf("StreamTitle = %q", got)
	}
	if got := extractICYField(meta, "StreamUrl"); got != "http://example.com/info" {
		t.Errorf("StreamUrl = %q", got)
	}
	if got := extractICYField(meta, "Missing"); got != "" {
		t.Errorf("Missing = %q; want empty", got)
	}
}
