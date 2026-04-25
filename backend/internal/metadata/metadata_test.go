package metadata

import (
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
		{
			name: "standard format",
			meta: "StreamTitle='Massive Attack - Teardrop';StreamUrl='';",
			key:  "StreamTitle",
			want: "Massive Attack - Teardrop",
		},
		{
			name: "last field without trailing semicolon",
			meta: "StreamTitle='Portishead - Glory Box'",
			key:  "StreamTitle",
			want: "Portishead - Glory Box",
		},
		{
			name: "empty value",
			meta: "StreamTitle='';StreamUrl='http://example.com';",
			key:  "StreamTitle",
			want: "",
		},
		{
			name: "key not present",
			meta: "StreamUrl='http://example.com';",
			key:  "StreamTitle",
			want: "",
		},
		{
			name: "title with comma",
			meta: "StreamTitle='Arca, Björk - Mutual Core';StreamUrl='';",
			key:  "StreamTitle",
			want: "Arca, Björk - Mutual Core",
		},
		{
			name: "null-padded block",
			meta: "StreamTitle='FKA Twigs - Cellophane';\x00\x00\x00\x00",
			key:  "StreamTitle",
			want: "FKA Twigs - Cellophane",
		},
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
// splitArtistTitle
// ---------------------------------------------------------------------------

func TestSplitArtistTitle(t *testing.T) {
	tests := []struct {
		input      string
		wantArtist string
		wantSong   string
	}{
		{"Massive Attack - Teardrop", "Massive Attack", "Teardrop"},
		{"Björk – Jóga", "Björk", "Jóga"},                     // en dash
		{"Portishead — Glory Box", "Portishead", "Glory Box"}, // em dash
		{"Only a title", "", "Only a title"},
		{"", "", ""},
		{"  Artist  -  Song  ", "Artist", "Song"}, // whitespace trimmed
		// Multiple " - " separators: first occurrence wins.
		{"A - B - C", "A", "B - C"},
		{"Variety Mix - Greta Rose -", "", "Variety Mix - Greta Rose -"},
		{"\"Suite No.5 in C minor, BWV 1011 (transposed to G minor) - I. Prelude\" by Johnny Gandelsman on Currents on WFMU", "Johnny Gandelsman", "Suite No.5 in C minor, BWV 1011 (transposed to G minor) - I. Prelude"},
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
// stripHTML
// ---------------------------------------------------------------------------

func TestStripHTML(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"<html><body>1,5,20,0,0,128,Artist - Song</body></html>", "1,5,20,0,0,128,Artist - Song"},
		{"plain text", "plain text"},
		{"&amp; &lt; &gt; &quot; &#039;", "& < > \" '"},
		{"<b>bold</b> &amp; <i>italic</i>", "bold & italic"},
	}

	for _, tc := range tests {
		got := stripHTML(tc.input)
		if got != tc.want {
			t.Errorf("stripHTML(%q) = %q; want %q", tc.input, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// isICYProtocolError
// ---------------------------------------------------------------------------

func TestIsICYProtocolError(t *testing.T) {
	cases := []struct {
		msg  string
		want bool
	}{
		{`malformed HTTP version "ICY"`, true},
		{"malformed HTTP response", true},
		{"bad status line", true},
		{"connection refused", false},
		{"context deadline exceeded", false},
		{"", false},
	}
	for _, tc := range cases {
		err := fmt.Errorf("%s", tc.msg) //nolint:goerr113
		if got := isICYProtocolError(err); got != tc.want {
			t.Errorf("isICYProtocolError(%q) = %v; want %v", tc.msg, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// fetchIcecastJSON via httptest server
// ---------------------------------------------------------------------------

func TestFetchIcecastJSONSingleSource(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"icestats": {
				"source": {
					"title": "Aphex Twin - Windowlicker",
					"mount": "/stream",
					"listenurl": "http://example.com/stream"
				}
			}
		}`))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	np, err := f.fetchIcecastJSON(t.Context(), srv.URL+"/stream")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Aphex Twin - Windowlicker" {
		t.Errorf("got title %q; want %q", np.Title, "Aphex Twin - Windowlicker")
	}
	if np.Artist != "Aphex Twin" {
		t.Errorf("got artist %q; want %q", np.Artist, "Aphex Twin")
	}
	if np.Source != "icecast" {
		t.Errorf("got source %q; want %q", np.Source, "icecast")
	}
}

func TestFetchIcecastJSONMultipleSources(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		// Two mounts — we request /hifi so the second source should be preferred.
		w.Write([]byte(`{
			"icestats": {
				"source": [
					{"title": "Low quality - wrong", "mount": "/lofi"},
					{"title": "Burial - Archangel", "mount": "/hifi"}
				]
			}
		}`))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	np, err := f.fetchIcecastJSON(t.Context(), srv.URL+"/hifi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Burial - Archangel" {
		t.Errorf("got title %q; want %q", np.Title, "Burial - Archangel")
	}
}

// ---------------------------------------------------------------------------
// fetchShoutcastCurrentSong via httptest server
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

	f := NewFetcher(slog.Default())
	np, err := f.fetchShoutcastCurrentSong(t.Context(), srv.URL+"/currentsong")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Four Tet - Baby" {
		t.Errorf("got title %q; want %q", np.Title, "Four Tet - Baby")
	}
	if np.Source != "shoutcast" {
		t.Errorf("got source %q; want %q", np.Source, "shoutcast")
	}
}

// ---------------------------------------------------------------------------
// fetchShoutcast7HTML via httptest server
// ---------------------------------------------------------------------------

func TestFetchShoutcast7HTML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/7.html" {
			http.NotFound(w, r)
			return
		}
		// CurrentListeners,StreamStatus,Peak,Max,Unique,Bitrate,Title
		w.Write([]byte("<html><body>3,1,10,100,3,128,Floating Points - LesAlpx</body></html>"))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	np, err := f.fetchShoutcast7HTML(t.Context(), srv.URL+"/7.html")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Floating Points - LesAlpx" {
		t.Errorf("got title %q; want %q", np.Title, "Floating Points - LesAlpx")
	}
}

func TestFetchShoutcast7HTMLTitleWithComma(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html><body>1,1,5,100,1,128,Arca, Björk - Mutual Core</body></html>"))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	np, err := f.fetchShoutcast7HTML(t.Context(), srv.URL+"/7.html")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != "Arca, Björk - Mutual Core" {
		t.Errorf("got title %q; want %q", np.Title, "Arca, Björk - Mutual Core")
	}
}

// ---------------------------------------------------------------------------
// Cache behaviour
// ---------------------------------------------------------------------------

func TestFetcherCachesResult(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Write([]byte(`{"icestats":{"source":{"title":"Cached Track","mount":"/s"}}}`))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	// Prime the cache via the JSON path so we don't need a real stream.
	f.fetchIcecastJSON(t.Context(), srv.URL+"/s") //nolint:errcheck

	// Manually insert into cache to test Fetch() cache path.
	f.mu.Lock()
	key := srv.URL + "/s"
	cacheKey := key + "|" + TypeAuto + "|true"
	f.cache[cacheKey] = cachedEntry{
		np:  &NowPlaying{Title: "Cached Track", Source: "icecast"},
		exp: time.Now().Add(cacheTTLSupported),
	}
	f.mu.Unlock()

	// Second call must not reach the server.
	serverCallsBefore := callCount
	np := f.Fetch(t.Context(), key, Config{Enabled: true, Type: TypeAuto})
	if callCount != serverCallsBefore {
		t.Errorf("expected no additional server calls; got %d", callCount-serverCallsBefore)
	}
	if np.Title != "Cached Track" {
		t.Errorf("got title %q; want %q", np.Title, "Cached Track")
	}
}

func TestFetchDisabled(t *testing.T) {
	f := NewFetcher(slog.Default())
	np := f.Fetch(t.Context(), "https://example.com/stream", Config{Enabled: false, Type: TypeAuto})
	if np.Status != "disabled" {
		t.Fatalf("got status %q; want disabled", np.Status)
	}
	if np.ErrorCode != ErrorCodeDisabled {
		t.Fatalf("got error code %q; want %q", np.ErrorCode, ErrorCodeDisabled)
	}
	if np.Supported {
		t.Fatalf("expected supported=false when disabled")
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

	f := NewFetcher(slog.Default())
	np := f.Fetch(t.Context(), srv.URL+"/stream", Config{Enabled: true, Type: TypeIcecast})
	if !np.Supported {
		t.Fatalf("expected supported=true")
	}
	if np.Status != "ok" {
		t.Fatalf("got status %q; want ok", np.Status)
	}
	if np.Source != "icecast" {
		t.Fatalf("got source %q; want icecast", np.Source)
	}
}

func TestFetchConfiguredIcecastErrorCode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte("upstream down"))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	np := f.Fetch(t.Context(), srv.URL+"/stream", Config{Enabled: true, Type: TypeIcecast})
	if np.Status != "error" {
		t.Fatalf("got status %q; want error", np.Status)
	}
	if np.ErrorCode != ErrorCodeStatus {
		t.Fatalf("got error code %q; want %q", np.ErrorCode, ErrorCodeStatus)
	}
}

func TestFetchDeduplicatesConcurrentRequests(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/status-json.xsl" {
			http.NotFound(w, r)
			return
		}
		atomic.AddInt32(&callCount, 1)
		time.Sleep(120 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"icestats":{"source":{"title":"Autechre - Gantz Graf","mount":"/stream"}}}`))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	cfg := Config{Enabled: true, Type: TypeIcecast}

	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			np := f.Fetch(t.Context(), srv.URL+"/stream", cfg)
			if np.Title == "" {
				t.Errorf("expected title from deduplicated fetch")
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

func TestFetchICYFromStream(t *testing.T) {
	const metaint = 64
	title := "DJ Shadow - Midnight in a Perfect World"
	metaRaw := "StreamTitle='" + title + "';"

	// Pad to 16-byte boundary.
	padded := metaRaw
	if rem := len(metaRaw) % 16; rem != 0 {
		padded += strings.Repeat("\x00", 16-rem)
	}
	lenByte := byte(len(padded) / 16)

	// Build a minimal ICY response body.
	body := strings.Builder{}
	body.WriteString(strings.Repeat("a", metaint)) // audio bytes
	body.WriteByte(lenByte)
	body.WriteString(padded)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Icy-Metaint", strconv.Itoa(metaint))
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Write([]byte(body.String()))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	np, err := f.fetchICY(t.Context(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != title {
		t.Errorf("got title %q; want %q", np.Title, title)
	}
	if np.Source != "icy" {
		t.Errorf("got source %q; want %q", np.Source, "icy")
	}
}

func TestFetchICYFromStreamSkipsEmptyPrerollBlocks(t *testing.T) {
	const metaint = 64
	firstMeta := "StreamTitle='';StreamUrl='';adw_ad='true';"
	secondTitle := "Kaitlyn Aurelia Smith - An Intention"
	secondMeta := "StreamTitle='" + secondTitle + "';"

	padBlock := func(raw string) string {
		padded := raw
		if rem := len(raw) % 16; rem != 0 {
			padded += strings.Repeat("\x00", 16-rem)
		}
		return string([]byte{byte(len(padded) / 16)}) + padded
	}

	body := strings.Builder{}
	for i := 0; i < 7; i++ {
		body.WriteString(strings.Repeat("a", metaint))
		body.WriteString(padBlock(firstMeta))
	}
	body.WriteString(strings.Repeat("b", metaint))
	body.WriteString(padBlock(secondMeta))

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Icy-Metaint", strconv.Itoa(metaint))
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Write([]byte(body.String()))
	}))
	defer srv.Close()

	f := NewFetcher(slog.Default())
	np, err := f.fetchICY(t.Context(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if np.Title != secondTitle {
		t.Errorf("got title %q; want %q", np.Title, secondTitle)
	}
	if np.Artist != "Kaitlyn Aurelia Smith" {
		t.Errorf("got artist %q; want %q", np.Artist, "Kaitlyn Aurelia Smith")
	}
}
