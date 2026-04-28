// Package telemetry configures OpenTelemetry instrumentation.
package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
)

const ExporterNone = "none"

type Config struct {
	Env                string
	ServiceName        string
	ServiceVersion     string
	TracesExporter     string
	OTLPEndpoint       string
	OTLPTracesEndpoint string
	OTLPProtocol       string
}

// Start configures the process tracer provider. It returns a shutdown function
// that must be called during process shutdown.
func Start(ctx context.Context, cfg Config, logger *slog.Logger) (func(context.Context) error, error) {
	exporterName := strings.ToLower(strings.TrimSpace(cfg.TracesExporter))
	if exporterName == "" || exporterName == ExporterNone {
		return func(context.Context) error { return nil }, nil
	}

	exporter, err := newExporter(ctx, cfg, exporterName)
	if err != nil {
		return nil, err
	}

	attrs := []attribute.KeyValue{
		semconv.ServiceName(firstNonEmpty(cfg.ServiceName, "backend")),
		semconv.DeploymentEnvironmentName(strings.TrimSpace(cfg.Env)),
	}
	if strings.TrimSpace(cfg.ServiceVersion) != "" {
		attrs = append(attrs, semconv.ServiceVersion(strings.TrimSpace(cfg.ServiceVersion)))
	}
	res, err := resource.Merge(resource.Default(), resource.NewWithAttributes(semconv.SchemaURL, attrs...))
	if err != nil {
		return nil, err
	}

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	logger.Info("opentelemetry tracing enabled", "event", "otel_tracing_enabled", "traces_exporter", exporterName)
	return provider.Shutdown, nil
}

func newExporter(ctx context.Context, cfg Config, exporterName string) (sdktrace.SpanExporter, error) {
	switch exporterName {
	case "stdout", "console":
		return stdouttrace.New(stdouttrace.WithPrettyPrint())
	case "otlp":
		return newOTLPExporter(ctx, cfg)
	default:
		return nil, fmt.Errorf("unsupported OTEL_TRACES_EXPORTER %q", exporterName)
	}
}

func newOTLPExporter(ctx context.Context, cfg Config) (sdktrace.SpanExporter, error) {
	protocol := strings.ToLower(strings.TrimSpace(cfg.OTLPProtocol))
	switch protocol {
	case "", "http/protobuf", "http":
		opts := make([]otlptracehttp.Option, 0, 1)
		if endpoint := strings.TrimSpace(cfg.OTLPTracesEndpoint); endpoint != "" {
			opts = append(opts, otlptracehttp.WithEndpointURL(endpoint))
		} else if endpoint := strings.TrimSpace(cfg.OTLPEndpoint); endpoint != "" {
			traceURL, err := otlpTraceEndpointURL(endpoint)
			if err != nil {
				return nil, err
			}
			opts = append(opts, otlptracehttp.WithEndpointURL(traceURL))
		}
		return otlptracehttp.New(ctx, opts...)
	case "grpc":
		opts := make([]otlptracegrpc.Option, 0, 1)
		if endpoint := strings.TrimSpace(cfg.OTLPTracesEndpoint); endpoint != "" {
			opts = append(opts, otlptracegrpc.WithEndpointURL(endpoint))
		} else if endpoint := strings.TrimSpace(cfg.OTLPEndpoint); endpoint != "" {
			opts = append(opts, otlptracegrpc.WithEndpointURL(endpoint))
		}
		return otlptracegrpc.New(ctx, opts...)
	default:
		return nil, fmt.Errorf("unsupported OTEL_EXPORTER_OTLP_PROTOCOL %q", protocol)
	}
}

func otlpTraceEndpointURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("parse OTEL_EXPORTER_OTLP_ENDPOINT: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("OTEL_EXPORTER_OTLP_ENDPOINT must include scheme and host")
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/v1/traces"
	return parsed.String(), nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
