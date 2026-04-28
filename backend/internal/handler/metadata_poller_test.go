package handler

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/radio"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

func TestMetadataResolverSnapshotAfterNoMetadataRecoversClientResolver(t *testing.T) {
	poller := &MetadataPoller{
		router: radio.NewMetadataRouter(&http.Client{
			Transport: metadataPollerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.URL.String() != "https://somafm.example/status-json.xsl" {
					t.Fatalf("unexpected request %s", req.URL.String())
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header: http.Header{
						"Access-Control-Allow-Origin": []string{"*"},
						"Content-Type":                []string{"application/json"},
					},
					Body:    io.NopCloser(strings.NewReader(`{"icestats":{"source":{"title":"Groove Salad"}}}`)),
					Request: req,
				}, nil
			}),
			Timeout: 2 * time.Second,
		}, []string{"http://localhost:3000"}),
	}

	checkedAt := time.Date(2026, 4, 28, 12, 0, 0, 0, time.UTC)
	snapshot := poller.metadataResolverSnapshotAfterNoMetadata(context.Background(), &store.StationStream{
		URL:             "https://somafm.example/stream",
		Kind:            "direct",
		Container:       "none",
		MetadataEnabled: true,
		MetadataType:    "auto",
		MetadataURL:     metadataStringPtr("https://somafm.example/status-json.xsl"),
	}, checkedAt, false)

	if snapshot.Resolver != metadata.ResolverClient {
		t.Fatalf("expected client resolver, got %q", snapshot.Resolver)
	}
	if snapshot.MetadataURL == nil || *snapshot.MetadataURL != "https://somafm.example/status-json.xsl" {
		t.Fatalf("expected hinted metadata URL to be preserved, got %#v", snapshot.MetadataURL)
	}
}

type metadataPollerRoundTripFunc func(*http.Request) (*http.Response, error)

func (f metadataPollerRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func metadataStringPtr(value string) *string {
	return &value
}
