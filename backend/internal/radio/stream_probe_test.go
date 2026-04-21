package radio

import (
	"context"
	"encoding/binary"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func response(req *http.Request, status int, contentType, body string, headers map[string]string) *http.Response {
	h := make(http.Header)
	if contentType != "" {
		h.Set("Content-Type", contentType)
	}
	for k, v := range headers {
		h.Set(k, v)
	}
	return &http.Response{
		StatusCode: status,
		Header:     h,
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    req,
	}
}

func TestProbeStreamDetectsHLSFromContentTypeOnOpaquePath(t *testing.T) {
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.Host == "radio.example" && req.URL.Path == "/opaque" {
				return response(req, http.StatusOK, "application/vnd.apple.mpegurl", "#EXTM3U\n", nil), nil
			}
			t.Fatalf("unexpected request %s", req.URL.String())
			return nil, nil
		}),
		Timeout: 2 * time.Second,
	}

	got := ProbeStream(context.Background(), client, "https://radio.example/opaque")
	if got.LastError != nil {
		t.Fatalf("expected no probe error, got %q", *got.LastError)
	}
	if got.Kind != "hls" || got.Container != "m3u8" {
		t.Fatalf("expected hls/m3u8, got %s/%s", got.Kind, got.Container)
	}
}

func TestProbeStreamResolvesNestedRelativePlaylist(t *testing.T) {
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case "https://radio.example/start.m3u":
				return response(req, http.StatusOK, "audio/x-mpegurl", "#EXTM3U\nnested/list.pls\n", nil), nil
			case "https://radio.example/nested/list.pls":
				return response(req, http.StatusOK, "audio/x-scpls", "[playlist]\nFile1=../audio/live\n", nil), nil
			case "https://radio.example/audio/live":
				return response(req, http.StatusOK, "audio/mpeg", "ICY 200 OK", nil), nil
			default:
				t.Fatalf("unexpected request %s", req.URL.String())
				return nil, nil
			}
		}),
		Timeout: 2 * time.Second,
	}

	got := ProbeStream(context.Background(), client, "https://radio.example/start.m3u")
	if got.LastError != nil {
		t.Fatalf("expected no probe error, got %q", *got.LastError)
	}
	if got.ResolvedURL != "https://radio.example/audio/live" {
		t.Fatalf("expected resolved audio URL, got %q", got.ResolvedURL)
	}
	if got.Kind != "direct" || got.Container != "none" {
		t.Fatalf("expected direct/none final result, got %s/%s", got.Kind, got.Container)
	}
}

func TestProbeStreamAllowsLimitedHostRedirectChain(t *testing.T) {
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case "https://a.example/start":
				return response(req, http.StatusFound, "", "", map[string]string{"Location": "https://b.example/mid"}), nil
			case "https://b.example/mid":
				return response(req, http.StatusFound, "", "", map[string]string{"Location": "https://c.example/live"}), nil
			case "https://c.example/live":
				return response(req, http.StatusOK, "audio/mpeg", "audio", nil), nil
			default:
				t.Fatalf("unexpected request %s", req.URL.String())
				return nil, nil
			}
		}),
		Timeout: 2 * time.Second,
	}

	got := ProbeStream(context.Background(), client, "https://a.example/start")
	if got.LastError != nil {
		t.Fatalf("expected success, got error %q", *got.LastError)
	}
	if got.ResolvedURL != "https://c.example/live" {
		t.Fatalf("expected final redirect URL, got %q", got.ResolvedURL)
	}
}

func TestProbeStreamRejectsPrivateRedirectTarget(t *testing.T) {
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case "https://safe.example/start":
				return response(req, http.StatusFound, "", "", map[string]string{"Location": "http://127.0.0.1/live"}), nil
			default:
				t.Fatalf("unexpected request %s", req.URL.String())
				return nil, nil
			}
		}),
		Timeout: 2 * time.Second,
	}

	got := ProbeStream(context.Background(), client, "https://safe.example/start")
	if got.LastError == nil {
		t.Fatalf("expected disallowed redirect error")
	}
	if !strings.Contains(strings.ToLower(*got.LastError), "disallowed") {
		t.Fatalf("expected disallowed error, got %q", *got.LastError)
	}
}

func TestParseFLACStreamInfo(t *testing.T) {
	streamInfo := make([]byte, 34)
	packed := (uint64(48000) << 44) | (uint64(2-1) << 41) | (uint64(24-1) << 36)
	binary.BigEndian.PutUint64(streamInfo[10:18], packed)

	data := make([]byte, 0, 4+4+34)
	data = append(data, []byte("fLaC")...)
	// STREAMINFO block header: last-metadata-block=1, type=0, length=34
	data = append(data, 0x80, 0x00, 0x00, 0x22)
	data = append(data, streamInfo...)

	sr, bd, ch, ok := parseFLACStreamInfo(data)
	if !ok {
		t.Fatalf("expected streaminfo parse success")
	}
	if sr != 48000 || bd != 24 || ch != 2 {
		t.Fatalf("unexpected parsed values: sr=%d bd=%d ch=%d", sr, bd, ch)
	}
}

func TestParseFLACStreamInfoWithLeadingBytes(t *testing.T) {
	streamInfo := make([]byte, 34)
	packed := (uint64(44100) << 44) | (uint64(2-1) << 41) | (uint64(16-1) << 36)
	binary.BigEndian.PutUint64(streamInfo[10:18], packed)

	data := make([]byte, 0, 16+4+4+34)
	data = append(data, []byte("ICY-HEADER-PREFIX")...)
	data = append(data, []byte("fLaC")...)
	// STREAMINFO block header: last-metadata-block=1, type=0, length=34
	data = append(data, 0x80, 0x00, 0x00, 0x22)
	data = append(data, streamInfo...)

	sr, bd, ch, ok := parseFLACStreamInfo(data)
	if !ok {
		t.Fatalf("expected streaminfo parse success")
	}
	if sr != 44100 || bd != 16 || ch != 2 {
		t.Fatalf("unexpected parsed values: sr=%d bd=%d ch=%d", sr, bd, ch)
	}
}

func TestParseMPEGAudioInfoMP3(t *testing.T) {
	// MPEG1 Layer III, 128 kbps, 44.1 kHz, stereo.
	header := []byte{0xFF, 0xFB, 0x90, 0x00}
	frameLen := 417
	data := make([]byte, frameLen+frameLen)
	copy(data[0:4], header)
	copy(data[frameLen:frameLen+4], header)

	codec, br, sr, ch, ok := parseMPEGAudioInfo(data)
	if !ok {
		t.Fatalf("expected MP3 parse success")
	}
	if codec != "MP3" || br != 128 || sr != 44100 || ch != 2 {
		t.Fatalf("unexpected parsed values: codec=%s br=%d sr=%d ch=%d", codec, br, sr, ch)
	}
}

func TestParseMPEGAudioInfoAAC(t *testing.T) {
	// ADTS AAC LC, 48 kHz, stereo, 2 short frames for sync validation.
	header := []byte{0xFF, 0xF1, 0x4C, 0x80, 0x00, 0xFF, 0xFC}
	data := append([]byte{}, header...)
	data = append(data, header...)

	codec, br, sr, ch, ok := parseMPEGAudioInfo(data)
	if !ok {
		t.Fatalf("expected AAC parse success")
	}
	if codec != "AAC" || br != 0 || sr != 48000 || ch != 2 {
		t.Fatalf("unexpected parsed values: codec=%s br=%d sr=%d ch=%d", codec, br, sr, ch)
	}
}
