package telemetry

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

const dependencyTracerName = "github.com/marko-stanojevic/project-ostgut/backend/dependencies"

// StartDependencySpan starts a client span for an outbound dependency without
// recording secrets or full URLs. Call EndDependencySpan exactly once.
func StartDependencySpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	spanName := "dependency." + safeSpanName(name)
	baseAttrs := []attribute.KeyValue{
		attribute.String("dependency.name", strings.TrimSpace(name)),
	}
	baseAttrs = append(baseAttrs, attrs...)
	return otel.Tracer(dependencyTracerName).Start(
		ctx,
		spanName,
		trace.WithSpanKind(trace.SpanKindClient),
		trace.WithAttributes(baseAttrs...),
	)
}

// EndDependencySpan records the terminal error state and ends the span.
func EndDependencySpan(span trace.Span, err error) {
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "dependency failed")
	}
	span.End()
}

// DoHTTPDependency executes req with a dependency span. It intentionally avoids
// url.full and query string attributes because stream and blob URLs can contain
// tokens. It records host, scheme, path, method, and status code instead.
func DoHTTPDependency(client *http.Client, req *http.Request, name string, attrs ...attribute.KeyValue) (*http.Response, error) {
	if req == nil {
		return nil, fmt.Errorf("nil dependency request")
	}
	if client == nil {
		client = http.DefaultClient
	}

	httpAttrs := []attribute.KeyValue{
		attribute.String("dependency.system", "http"),
		attribute.String("http.request.method", req.Method),
	}
	if req.URL != nil {
		httpAttrs = append(httpAttrs,
			attribute.String("url.scheme", req.URL.Scheme),
			attribute.String("server.address", req.URL.Hostname()),
		)
		if req.URL.Port() != "" {
			httpAttrs = append(httpAttrs, attribute.String("server.port", req.URL.Port()))
		}
		if req.URL.Path != "" {
			httpAttrs = append(httpAttrs, attribute.String("url.path", req.URL.EscapedPath()))
		}
	}
	httpAttrs = append(httpAttrs, attrs...)

	ctx, span := StartDependencySpan(req.Context(), name, httpAttrs...)
	resp, err := client.Do(req.Clone(ctx))
	if resp != nil {
		span.SetAttributes(attribute.Int("http.response.status_code", resp.StatusCode))
		if resp.StatusCode >= 500 {
			span.SetStatus(codes.Error, "upstream server error")
		}
	}
	EndDependencySpan(span, err)
	return resp, err
}

func safeSpanName(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	if name == "" {
		return "unknown"
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '_' || r == '-' || r == '.':
			b.WriteRune(r)
		case r == ' ' || r == '/':
			b.WriteByte('_')
		}
	}
	if b.Len() == 0 {
		return "unknown"
	}
	return b.String()
}
