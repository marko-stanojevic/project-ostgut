package metadata

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// extractICYField
// ---------------------------------------------------------------------------

func TestExtractICYField(t *testing.T) {
	tests := []struct {
		name string
		meta string
		key  string
		want string
	}{
		{"standard format", "StreamTitle='Massive Attack - Teardrop';StreamUrl='';", "StreamTitle", "Massive Attack - Teardrop"},
		{"last field without trailing semicolon", "StreamTitle='Portishead - Glory Box'", "StreamTitle", "Portishead - Glory Box"},
		{"empty value", "StreamTitle='';StreamUrl='http://example.com';", "StreamTitle", ""},
		{"key not present", "StreamUrl='http://example.com';", "StreamTitle", ""},
		{"title with comma", "StreamTitle='Arca, Björk - Mutual Core';StreamUrl='';", "StreamTitle", "Arca, Björk - Mutual Core"},
		{"null-padded block", "StreamTitle='FKA Twigs - Cellophane';\x00\x00\x00\x00", "StreamTitle", "FKA Twigs - Cellophane"},
		// Embedded apostrophe inside the value: regex-driven parser must not
		// truncate at the first single quote.
		{"embedded apostrophe", "StreamTitle='O'Brien - Untitled';StreamUrl='';", "StreamTitle", "O'Brien - Untitled"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := extractICYField(tc.meta, tc.key)
			if got != tc.want {
				t.Errorf("extractICYField(%q, %q) = %q; want %q", tc.meta, tc.key, got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// splitArtistTitle / parseQuotedBylineTitle
// ---------------------------------------------------------------------------

func TestSplitArtistTitle(t *testing.T) {
	tests := []struct {
		input      string
		wantArtist string
		wantSong   string
	}{
		{"Massive Attack - Teardrop", "Massive Attack", "Teardrop"},
		{"Björk – Jóga", "Björk", "Jóga"},
		{"Portishead — Glory Box", "Portishead", "Glory Box"},
		{"Only a title", "", "Only a title"},
		{"", "", ""},
		{"  Artist  -  Song  ", "Artist", "Song"},
		{"A - B - C", "A", "B - C"},
		{"Variety Mix - Greta Rose -", "Variety Mix", "Greta Rose"},
		{"Warn Yuh - Jah Lil -", "Warn Yuh", "Jah Lil"},
		{"\"Suite No.5 in C minor, BWV 1011 (transposed to G minor) - I. Prelude\" by Johnny Gandelsman on Currents on WFMU", "Johnny Gandelsman", "Suite No.5 in C minor, BWV 1011 (transposed to G minor) - I. Prelude"},
		// Apostrophe contraction must NOT match the quoted-byline branch.
		{"'Cause I Said So - Foo", "'Cause I Said So", "Foo"},
	}

	for _, tc := range tests {
		a, s := splitArtistTitle(tc.input)
		if a != tc.wantArtist || s != tc.wantSong {
			t.Errorf("splitArtistTitle(%q) = (%q, %q); want (%q, %q)",
				tc.input, a, s, tc.wantArtist, tc.wantSong)
		}
	}
}

// ---------------------------------------------------------------------------
// normalizeMetadataTitle
// ---------------------------------------------------------------------------

func TestNormalizeMetadataTitle(t *testing.T) {
	cases := map[string]string{
		"Track":         "Track",
		"Track -":       "Track",
		"Track - - - -": "Track",
		"Track – – –":   "Track",
		"Track —":       "Track",
		"Mixed - – —":   "Mixed",
		"  Spaced  ":    "Spaced",
		"":              "",
		"Foo Bar":       "Foo Bar",
		"Foo - Bar - ":  "Foo - Bar", // only trailing separator stripped
	}
	for in, want := range cases {
		if got := normalizeMetadataTitle(in); got != want {
			t.Errorf("normalizeMetadataTitle(%q) = %q; want %q", in, got, want)
		}
	}
}

// ---------------------------------------------------------------------------
// stripHTML
// ---------------------------------------------------------------------------

func TestStripHTML(t *testing.T) {
	tests := []struct{ in, want string }{
		{"<html><body>1,5,20,0,0,128,Artist - Song</body></html>", "1,5,20,0,0,128,Artist - Song"},
		{"plain text", "plain text"},
		{"&amp; &lt; &gt; &quot; &#039;", "& < > \" '"},
		{"<b>bold</b> &amp; <i>italic</i>", "bold & italic"},
	}
	for _, tc := range tests {
		if got := stripHTML(tc.in); got != tc.want {
			t.Errorf("stripHTML(%q) = %q; want %q", tc.in, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// isPlaceholderTitle
// ---------------------------------------------------------------------------

func TestIsPlaceholderTitle(t *testing.T) {
	yes := []string{"", " ", "-", "--", "n/a", "N/A", "NULL", "undefined", "Unknown", `"-"`, "''"}
	no := []string{"Artist - Song", "0", "Track 1"}
	for _, s := range yes {
		if !isPlaceholderTitle(s) {
			t.Errorf("expected placeholder: %q", s)
		}
	}
	for _, s := range no {
		if isPlaceholderTitle(s) {
			t.Errorf("expected non-placeholder: %q", s)
		}
	}
}

// ---------------------------------------------------------------------------
// errors / classification
// ---------------------------------------------------------------------------

func TestErrorCodeFromErr(t *testing.T) {
	cases := []struct {
		err  error
		want string
	}{
		{nil, ErrorCodeNoMeta},
		{context.DeadlineExceeded, ErrorCodeTimeout},
		{context.Canceled, ErrorCodeTimeout},
		{fmt.Errorf("wrapped: %w", ErrICYProtocol), ErrorCodeProtocol},
		{fmt.Errorf("wrapped: %w", ErrParse), ErrorCodeParse},
		{fmt.Errorf("wrapped: %w", ErrUpstreamStatus), ErrorCodeStatus},
		{fmt.Errorf("wrapped: %w", ErrNoMetaint), ErrorCodeNoMeta},
		{fmt.Errorf("wrapped: %w", ErrEmptyMetadata), ErrorCodeNoMeta},
		{fmt.Errorf("wrapped: %w", ErrNoStreamTitle), ErrorCodeNoMeta},
		{errors.New("totally unknown"), ErrorCodeFetch},
	}
	for _, tc := range cases {
		if got := errorCodeFromErr(tc.err); got != tc.want {
			t.Errorf("errorCodeFromErr(%v) = %q; want %q", tc.err, got, tc.want)
		}
	}
}

func TestIsICYProtocolError(t *testing.T) {
	if !isICYProtocolError(fmt.Errorf("wrapped: %w", ErrICYProtocol)) {
		t.Errorf("expected ICY protocol detection")
	}
	if isICYProtocolError(errors.New("connection refused")) {
		t.Errorf("did not expect ICY protocol detection on plain error")
	}
}

// ---------------------------------------------------------------------------
// fetchIcecastJSON
// ---------------------------------------------------------------------------

func newFetcher(t *testing.T) *Fetcher {
	t.Helper()
	f := NewFetcher(slog.Default())
	t.Cleanup(func() { _ = f.Close() })
	return f
}

func TestFetchIcecastJSONSingleSource(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"Aphex Twin - Windowlicker","mount":"/stream","listenurl":"http://example.com/stream"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, err := f.fetchIcecastJSON(t.Context(), srv.URL+"/stream")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Aphex Twin - Windowlicker" || np.Artist != "Aphex Twin" || np.Source != TypeIcecast {
		t.Errorf("got %+v", np)
	}
}

func TestFetchIcecastJSONMultipleSources(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":[{"title":"Low quality - wrong","mount":"/lofi"},{"title":"Burial - Archangel","mount":"/hifi"}]}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, err := f.fetchIcecastJSON(t.Context(), srv.URL+"/hifi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Burial - Archangel" {
		t.Errorf("got title %q", np.Title)
	}
}

// ---------------------------------------------------------------------------
// shoutcast
// ---------------------------------------------------------------------------

func TestFetchShoutcastCurrentSong(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/currentsong" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte("Four Tet - Baby"))
	}))
	defer srv.Close()
	f := newFetcher(t)
	np, err := f.fetchShoutcastCurrentSong(t.Context(), srv.URL+"/currentsong")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Four Tet - Baby" || np.Source != TypeShoutcast {
		t.Errorf("got %+v", np)
	}
}

func TestFetchShoutcast7HTML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html><body>3,1,10,100,3,128,Floating Points - LesAlpx</body></html>"))
	}))
	defer srv.Close()
	f := newFetcher(t)
	np, err := f.fetchShoutcast7HTML(t.Context(), srv.URL+"/7.html")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Floating Points - LesAlpx" {
		t.Errorf("got title %q", np.Title)
	}
}

func TestFetchShoutcast7HTMLTitleWithComma(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html><body>1,1,5,100,1,128,Arca, Björk - Mutual Core</body></html>"))
	}))
	defer srv.Close()
	f := newFetcher(t)
	np, err := f.fetchShoutcast7HTML(t.Context(), srv.URL+"/7.html")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Arca, Björk - Mutual Core" {
		t.Errorf("got title %q", np.Title)
	}
}

// ---------------------------------------------------------------------------
// Cache + Fetch behaviour
// ---------------------------------------------------------------------------

func TestFetcherCachesResult(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Write([]byte(`{"icestats":{"source":{"title":"Cached Track","mount":"/s"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	streamURL := srv.URL + "/s"

	// Manually insert into cache to test Fetch() cache path.
	cfg := Config{Enabled: true, Type: TypeAuto}
	key := cfg.cacheKey(streamURL)
	f.mu.Lock()
	f.cache[key] = cachedEntry{
		np:       &NowPlaying{Title: "Cached Track", Source: TypeIcecast, Supported: true, Status: "ok"},
		strategy: TypeIcecast,
		exp:      time.Now().Add(cacheTTLSupported),
	}
	f.mu.Unlock()

	np, ev := f.Fetch(t.Context(), streamURL, cfg)
	if callCount != 0 {
		t.Errorf("expected no upstream calls, got %d", callCount)
	}
	if np.Title != "Cached Track" {
		t.Errorf("got title %q", np.Title)
	}
	if !ev.CacheHit {
		t.Errorf("expected CacheHit=true")
	}
}

func TestFetchDisabled(t *testing.T) {
	f := newFetcher(t)
	np, _ := f.Fetch(t.Context(), "https://example.com/stream", Config{Enabled: false, Type: TypeAuto})
	if np.Status != "disabled" || np.ErrorCode != ErrorCodeDisabled || np.Supported {
		t.Fatalf("got %+v", np)
	}
}

func TestFetchConfiguredIcecastOnly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"Nils Frahm - Says","mount":"/stream"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, ev := f.Fetch(t.Context(), srv.URL+"/stream", Config{Enabled: true, Type: TypeIcecast})
	if !np.Supported || np.Status != "ok" || np.Source != TypeIcecast {
		t.Fatalf("got %+v", np)
	}
	if ev.Strategy != TypeIcecast {
		t.Errorf("got strategy %q", ev.Strategy)
	}
}

func TestFetchConfiguredIcecastErrorCode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, _ := f.Fetch(t.Context(), srv.URL+"/stream", Config{Enabled: true, Type: TypeIcecast})
	if np.Status != "error" || np.ErrorCode != ErrorCodeStatus {
		t.Fatalf("got %+v", np)
	}
}

func TestFetchDeduplicatesConcurrentRequests(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		time.Sleep(120 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"Autechre - Gantz Graf","mount":"/stream"}}}`))
	}))
	defer srv.Close()

	f := newFetcher(t)
	cfg := Config{Enabled: true, Type: TypeIcecast}

	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			np, _ := f.Fetch(t.Context(), srv.URL+"/stream", cfg)
			if np.Title == "" {
				t.Errorf("expected title")
			}
		}()
	}
	wg.Wait()

	if got := atomic.LoadInt32(&callCount); got != 1 {
		t.Fatalf("expected 1 upstream request, got %d", got)
	}
}

// ---------------------------------------------------------------------------
// ICY stream simulation
// ---------------------------------------------------------------------------

func padICYBlock(raw string) string {
	padded := raw
	if rem := len(raw) % 16; rem != 0 {
		padded += strings.Repeat("\x00", 16-rem)
	}
	return string([]byte{byte(len(padded) / 16)}) + padded
}

func TestFetchICYFromStream(t *testing.T) {
	const metaint = 64
	title := "DJ Shadow - Midnight in a Perfect World"

	body := strings.Builder{}
	body.WriteString(strings.Repeat("a", metaint))
	body.WriteString(padICYBlock("StreamTitle='" + title + "';"))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Icy-Metaint", strconv.Itoa(metaint))
		w.Write([]byte(body.String()))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, blocks, err := f.fetchICY(t.Context(), srv.URL, maxICYMetadataBlocksFast)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != title || np.Source != TypeICY {
		t.Errorf("got %+v", np)
	}
	if blocks < 1 {
		t.Errorf("expected blocks >= 1, got %d", blocks)
	}
}

func TestFetchICYSkipsEmptyPrerollBlocks(t *testing.T) {
	const metaint = 64
	secondTitle := "Kaitlyn Aurelia Smith - An Intention"

	body := strings.Builder{}
	for i := 0; i < 7; i++ {
		body.WriteString(strings.Repeat("a", metaint))
		body.WriteString(padICYBlock("StreamTitle='';StreamUrl='';adw_ad='true';"))
	}
	body.WriteString(strings.Repeat("b", metaint))
	body.WriteString(padICYBlock("StreamTitle='" + secondTitle + "';"))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Icy-Metaint", strconv.Itoa(metaint))
		w.Write([]byte(body.String()))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, _, err := f.fetchICY(t.Context(), srv.URL, maxICYMetadataBlocksFast)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != secondTitle || np.Artist != "Kaitlyn Aurelia Smith" {
		t.Errorf("got %+v", np)
	}
}

// Probe should detect a delayed stream that sits past the fast budget.
func TestProbeDetectsDelayedMetadata(t *testing.T) {
	const metaint = 64
	delayedTitle := "KEXP - Live from Seattle"

	body := strings.Builder{}
	for i := 0; i < maxICYMetadataBlocksFast; i++ {
		body.WriteString(strings.Repeat("a", metaint))
		body.WriteString(padICYBlock("StreamTitle='';"))
	}
	body.WriteString(strings.Repeat("b", metaint))
	body.WriteString(padICYBlock("StreamTitle='" + delayedTitle + "';"))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Icy-Metaint", strconv.Itoa(metaint))
		w.Write([]byte(body.String()))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, ev := f.Probe(t.Context(), srv.URL, Config{Enabled: true, Type: TypeICY})
	if np.Title != delayedTitle || np.Status != "ok" {
		t.Fatalf("got %+v", np)
	}
	if !ev.DelayedICY {
		t.Fatalf("expected DelayedICY=true; ev=%+v", ev)
	}
	if ev.BlocksRead == 0 {
		t.Fatalf("expected BlocksRead > 0; ev=%+v", ev)
	}
	if ev.Strategy != TypeICY {
		t.Errorf("expected strategy=icy; got %q", ev.Strategy)
	}
}

// Runtime Fetch must NOT extend to the slow budget. A stream that only
// reveals metadata after the fast budget should fail with no_metadata.
func TestFetchRuntimeDoesNotUseSlowBudget(t *testing.T) {
	const metaint = 64
	delayedTitle := "Late Title"

	body := strings.Builder{}
	for i := 0; i < maxICYMetadataBlocksFast; i++ {
		body.WriteString(strings.Repeat("a", metaint))
		body.WriteString(padICYBlock("StreamTitle='';"))
	}
	body.WriteString(strings.Repeat("b", metaint))
	body.WriteString(padICYBlock("StreamTitle='" + delayedTitle + "';"))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Icy-Metaint", strconv.Itoa(metaint))
		w.Write([]byte(body.String()))
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, _ := f.Fetch(t.Context(), srv.URL, Config{Enabled: true, Type: TypeICY})
	if np.Status != "error" {
		t.Fatalf("expected error status; got %q (%+v)", np.Status, np)
	}
}

// ---------------------------------------------------------------------------
// Cache key, Close, bounded cache
// ---------------------------------------------------------------------------

func TestCacheKeyDoesNotCollide(t *testing.T) {
	a := Config{Enabled: true, Type: TypeAuto, MetadataURL: "x|y", DelayedICY: false}
	b := Config{Enabled: true, Type: TypeAuto, MetadataURL: "x", DelayedICY: false}
	if a.cacheKey("u") == b.cacheKey("u") {
		t.Fatalf("cache keys must differ for distinct MetadataURL values")
	}
	c := Config{Enabled: true, Type: TypeAuto, DelayedICY: true}
	d := Config{Enabled: true, Type: TypeAuto, DelayedICY: false}
	if c.cacheKey("u") == d.cacheKey("u") {
		t.Fatalf("cache keys must differ for delayed flag")
	}
}

func TestFetcherCloseStopsEviction(t *testing.T) {
	f := NewFetcher(slog.Default())
	if err := f.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	// Second close is a no-op.
	if err := f.Close(); err != nil {
		t.Fatalf("second close: %v", err)
	}
}

func TestFetcherEnforceCacheBound(t *testing.T) {
	f := NewFetcher(slog.Default(), WithMaxCacheEntries(2))
	t.Cleanup(func() { _ = f.Close() })

	exp := time.Now().Add(cacheTTLSupported)
	f.mu.Lock()
	for i := 0; i < 5; i++ {
		k := cacheKey{URL: fmt.Sprintf("u%d", i), Type: TypeAuto, Enabled: true}
		f.cache[k] = cachedEntry{np: &NowPlaying{Title: "x"}, exp: exp}
	}
	f.enforceCacheBound()
	got := len(f.cache)
	f.mu.Unlock()
	if got > 2 {
		t.Fatalf("expected cache size <= 2 after enforceCacheBound; got %d", got)
	}
}

// ---------------------------------------------------------------------------
// Playlist resolution
// ---------------------------------------------------------------------------

func TestResolvePlaylistM3U(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// CRLF is critical: many real-world playlists use Windows line endings.
		w.Write([]byte("#EXTM3U\r\n#EXTINF:-1\r\nhttp://example.com/real-stream.mp3\r\n"))
	}))
	defer srv.Close()

	f := newFetcher(t)
	got, ok := f.resolvePlaylist(t.Context(), srv.URL+"/playlist.m3u")
	if !ok {
		t.Fatalf("expected playlist resolution to succeed")
	}
	if got != "http://example.com/real-stream.mp3" {
		t.Fatalf("got %q", got)
	}
}

func TestResolvePlaylistPLS(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("[playlist]\r\nFile1=http://example.com/real.mp3\r\nLength1=-1\r\n"))
	}))
	defer srv.Close()

	f := newFetcher(t)
	got, ok := f.resolvePlaylist(t.Context(), srv.URL+"/play.pls")
	if !ok || got != "http://example.com/real.mp3" {
		t.Fatalf("got %q ok=%v", got, ok)
	}
}

// ---------------------------------------------------------------------------
// resolveAuto skips ICY for HLS
// ---------------------------------------------------------------------------

func TestResolveAutoSkipsICYForHLS(t *testing.T) {
	icyHits := int32(0)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/status-json.xsl":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"icestats":{"source":{"title":"HLS Source - Track","mount":"/live.m3u8"}}}`))
		case "/live.m3u8":
			// Sniff: ICY would request the .m3u8 URL. We must not see this.
			atomic.AddInt32(&icyHits, 1)
			http.NotFound(w, r)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	f := newFetcher(t)
	np, ev := f.Fetch(t.Context(), srv.URL+"/live.m3u8", Config{Enabled: true, Type: TypeAuto})
	if np.Title == "" {
		t.Fatalf("expected title from icecast fallback; got %+v", np)
	}
	if ev.Strategy != TypeIcecast {
		t.Errorf("expected icecast strategy; got %q", ev.Strategy)
	}
	if atomic.LoadInt32(&icyHits) != 0 {
		t.Errorf("expected no ICY attempts on HLS URL; got %d", icyHits)
	}
}

// ---------------------------------------------------------------------------
// Metrics hook
// ---------------------------------------------------------------------------

type recordingMetrics struct {
	mu      sync.Mutex
	fetches int
	hits    int
	delayed int
	lastOK  bool
	lastStr string
}

func (m *recordingMetrics) OnFetch(strategy string, ok bool, _ time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.fetches++
	m.lastOK = ok
	m.lastStr = strategy
}
func (m *recordingMetrics) OnDelayedDetected(string) { m.mu.Lock(); m.delayed++; m.mu.Unlock() }
func (m *recordingMetrics) OnCacheHit(string)        { m.mu.Lock(); m.hits++; m.mu.Unlock() }

func TestMetricsHookFires(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte(`{"icestats":{"source":{"title":"M - T","mount":"/s"}}}`))
	}))
	defer srv.Close()

	m := &recordingMetrics{}
	f := NewFetcher(slog.Default(), WithMetrics(m))
	t.Cleanup(func() { _ = f.Close() })

	cfg := Config{Enabled: true, Type: TypeIcecast}
	f.Fetch(t.Context(), srv.URL+"/s", cfg)
	f.Fetch(t.Context(), srv.URL+"/s", cfg) // cache hit

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.fetches < 1 || m.hits < 1 {
		t.Fatalf("expected metrics fired; got %+v", m)
	}
	if m.lastStr != TypeIcecast {
		t.Errorf("expected last strategy icecast; got %q", m.lastStr)
	}
}

// ---------------------------------------------------------------------------
// MetadataWaitSeconds
// ---------------------------------------------------------------------------

func TestMetadataWaitSeconds(t *testing.T) {
	if got := MetadataWaitSeconds(false); got != 6 {
		t.Errorf("normal wait = %d; want 6", got)
	}
	if got := MetadataWaitSeconds(true); got != 20 {
		t.Errorf("delayed wait = %d; want 20", got)
	}
}
