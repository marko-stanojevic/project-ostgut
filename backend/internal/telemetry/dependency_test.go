package telemetry

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestDoHTTPDependencyDoesNotRecordQueryString(t *testing.T) {
	exporter := tracetest.NewInMemoryExporter()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	previousProvider := otel.GetTracerProvider()
	otel.SetTracerProvider(provider)
	t.Cleanup(func() {
		otel.SetTracerProvider(previousProvider)
		_ = provider.Shutdown(context.Background())
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	t.Cleanup(server.Close)

	req, err := http.NewRequest(http.MethodGet, server.URL+"/stream?token=super-secret", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	res, err := DoHTTPDependency(server.Client(), req, "stream_probe")
	if err != nil {
		t.Fatalf("do dependency: %v", err)
	}
	_, _ = io.Copy(io.Discard, res.Body)
	_ = res.Body.Close()

	spans := exporter.GetSpans()
	if len(spans) != 1 {
		t.Fatalf("expected 1 span, got %d", len(spans))
	}
	for _, attr := range spans[0].Attributes {
		key := string(attr.Key)
		value := fmt.Sprint(attr.Value.AsInterface())
		if key == "url.full" {
			t.Fatalf("span must not record url.full")
		}
		if strings.Contains(value, "super-secret") || strings.Contains(value, "token=") {
			t.Fatalf("span attribute %s leaked query string value %q", key, value)
		}
	}
}
