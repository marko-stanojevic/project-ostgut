package radio

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestResolveMetadataResolverForStreamPrefersClientForDirectStreams(t *testing.T) {
	got := ResolveMetadataResolverForStream(true, "direct", true, false)
	if got != "client" {
		t.Fatalf("expected client resolver, got %q", got)
	}
}

func TestResolveMetadataResolverForStreamDisablesHLSWithoutID3(t *testing.T) {
	got := ResolveMetadataResolverForStream(true, "hls", true, false)
	if got != "none" {
		t.Fatalf("expected none resolver, got %q", got)
	}
}

func TestProbeClientMetadataSupportUsesHintedMetadataURL(t *testing.T) {
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			switch req.URL.String() {
			case "https://radio.example/status-json.xsl":
				return response(req, http.StatusOK, "application/json", `{"icestats":{"source":{"title":"Now Playing"}}}`, map[string]string{
					"Access-Control-Allow-Origin": "*",
				}), nil
			default:
				t.Fatalf("unexpected request %s", req.URL.String())
				return nil, nil
			}
		}),
		Timeout: 2 * time.Second,
	}

	got := ProbeClientMetadataSupport(
		context.Background(),
		client,
		[]string{"http://localhost:3000"},
		"https://radio.example/stream",
		"https://radio.example/status-json.xsl",
		"direct",
		"none",
		true,
		"auto",
	)

	if !got.Supported {
		t.Fatalf("expected hinted metadata URL to be treated as client-readable")
	}
	if got.MetadataURL != "https://radio.example/status-json.xsl" {
		t.Fatalf("expected hinted metadata URL, got %q", got.MetadataURL)
	}
}