package radio

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestMetadataRouterClassifyReturnsNoneWhenDisabled(t *testing.T) {
	router := NewMetadataRouter(nil, nil)

	got := router.Classify(context.Background(), MetadataRouteInput{
		StreamURL:       "https://example.com/stream",
		MetadataEnabled: false,
	})

	if got.Resolver != "none" {
		t.Fatalf("expected none resolver, got %q", got.Resolver)
	}
	if got.CheckedAt.IsZero() {
		t.Fatal("expected checked timestamp")
	}
}

func TestMetadataRouterClassifyPrefersHintedBrowserReadableEndpoint(t *testing.T) {
	origin := "https://console.staging.worksfine.app"
	router := NewMetadataRouter(&http.Client{
		Transport: metadataRouterRoundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.String() != "https://somafm.example/status-json.xsl" {
				t.Fatalf("unexpected request %s", req.URL.String())
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"Access-Control-Allow-Origin": []string{origin},
					"Content-Type":                []string{"application/json"},
				},
				Body:    io.NopCloser(strings.NewReader(`{"icestats":{"source":{"title":"Now Playing"}}}`)),
				Request: req,
			}, nil
		}),
	}, []string{origin})
	got := router.Classify(context.Background(), MetadataRouteInput{
		StreamURL:       "https://somafm.example/stream",
		MetadataURLHint: "https://somafm.example/status-json.xsl",
		Kind:            "direct",
		Container:       "none",
		MetadataEnabled: true,
		MetadataType:    "auto",
	})

	if got.Resolver != "client" {
		t.Fatalf("expected client resolver, got %q", got.Resolver)
	}
	if got.MetadataURL == nil || *got.MetadataURL != "https://somafm.example/status-json.xsl" {
		t.Fatalf("expected hinted metadata url, got %#v", got.MetadataURL)
	}
}

type metadataRouterRoundTripFunc func(*http.Request) (*http.Response, error)

func (f metadataRouterRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
