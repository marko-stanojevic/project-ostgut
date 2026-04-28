// Package config loads application configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strings"
)

// Config holds all runtime configuration for the service.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port string

	// DatabaseURL is the PostgreSQL connection string.
	DatabaseURL string

	// JWTSecret is the HS256 signing secret used to issue and verify the
	// backend's own access tokens. Independent of the frontend AUTH_SECRET.
	JWTSecret string

	// OAuthSharedSecret is the HMAC secret shared with the Next.js server.
	// The Next.js server signs (provider, providerID, email, emailVerified, ts)
	// when calling POST /auth/oauth so the backend can verify the handshake
	// originated from a trusted process and not an arbitrary HTTP client.
	OAuthSharedSecret string

	// PublicAPIBaseURL is the externally-resolvable base URL of this API
	// (e.g. https://api.staging.worksfine.app). Used to build absolute URLs
	// (signed media upload URLs) without trusting client-supplied Host headers.
	PublicAPIBaseURL string

	// TrustedProxies is the list of CIDRs Gin will trust for X-Forwarded-*.
	// Empty disables proxy trust (c.ClientIP returns the direct peer).
	TrustedProxies []string

	// AllowedOrigins is the list of origins permitted by the CORS middleware.
	// Comma-separated, e.g. "http://localhost:3000,https://app.example.com"
	AllowedOrigins []string

	// BrowserMetadataProbeOrigins is the list of browser origins used when
	// probing whether stream metadata is readable from the frontend.
	BrowserMetadataProbeOrigins []string

	// Env is the deployment environment (local | staging | production).
	Env string

	// LogLevel controls the minimum log level ("debug" | "info").
	// Defaults to "info".
	LogLevel string

	// OTelTracesExporter controls backend trace export ("none" | "stdout" | "otlp").
	// Defaults to "none" so local development stays lightweight until enabled.
	OTelTracesExporter string

	// OTelServiceName is the OpenTelemetry service.name resource attribute.
	OTelServiceName string

	// ServiceVersion is emitted as service.version when available.
	ServiceVersion string

	// OTelExporterOTLPEndpoint is the standard OTLP base endpoint.
	OTelExporterOTLPEndpoint string

	// OTelExporterOTLPTracesEndpoint is the standard OTLP traces endpoint.
	OTelExporterOTLPTracesEndpoint string

	// OTelExporterOTLPProtocol selects the OTLP transport ("http/protobuf" | "grpc").
	OTelExporterOTLPProtocol string

	// Paddle billing configuration.
	PaddleAPIKey        string
	PaddleWebhookSecret string
	PaddleClientToken   string
	PaddlePriceID       string

	// MediaUploadBaseURL is the base URL returned to clients for direct uploads.
	// Example: https://<storage-account>.blob.core.windows.net/uploads
	MediaUploadBaseURL string

	// MediaUploadSigningSecret signs short-lived backend upload URLs.
	MediaUploadSigningSecret string

	// MediaStorageAccountName is the Azure Blob Storage account used by backend
	// server-to-server media operations when managed identity is enabled.
	MediaStorageAccountName string

	// MediaStorageContainerName is the blob container used for media objects.
	MediaStorageContainerName string

	// MediaStorageAccountKey is an Azure Storage shared key used for local
	// development. When set it takes priority over managed identity / CLI auth.
	// Never set this in production — use managed identity instead.
	MediaStorageAccountKey string

	// NewRelicLicenseKey is the ingest license key for the New Relic agent.
	// When empty, the agent is disabled (no-op).
	NewRelicLicenseKey string

	// NewRelicAppName is the application name shown in the New Relic UI.
	NewRelicAppName string
}

// Load reads configuration from environment variables, returning an error when
// required values are absent.
func Load() (*Config, error) {
	port := getEnv("PORT", "8080")

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL must be set")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET must be set")
	}

	env := getEnv("ENV", "local")

	oauthSharedSecret := os.Getenv("OAUTH_SHARED_SECRET")
	if oauthSharedSecret == "" {
		if env == "production" || env == "staging" {
			return nil, fmt.Errorf("OAUTH_SHARED_SECRET must be set in %s", env)
		}
		// Local dev: fall back to JWT_SECRET so the dev loop keeps working.
		oauthSharedSecret = jwtSecret
	}

	allowedOrigins := splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:3000"))
	if env == "production" || env == "staging" {
		if len(allowedOrigins) == 0 {
			return nil, fmt.Errorf("ALLOWED_ORIGINS must be set in %s", env)
		}
		for _, o := range allowedOrigins {
			if o == "*" {
				return nil, fmt.Errorf("ALLOWED_ORIGINS must not contain '*' in %s", env)
			}
			if !strings.HasPrefix(o, "https://") {
				return nil, fmt.Errorf("ALLOWED_ORIGINS entries must be https:// in %s, got %q", env, o)
			}
		}
	}
	browserMetadataProbeOrigins := splitCSV(getEnv("BROWSER_METADATA_PROBE_ORIGINS", strings.Join(allowedOrigins, ",")))

	cfg := &Config{
		Port:                           port,
		DatabaseURL:                    databaseURL,
		JWTSecret:                      jwtSecret,
		OAuthSharedSecret:              oauthSharedSecret,
		PublicAPIBaseURL:               strings.TrimRight(os.Getenv("PUBLIC_API_BASE_URL"), "/"),
		TrustedProxies:                 splitCSV(os.Getenv("TRUSTED_PROXIES")),
		AllowedOrigins:                 allowedOrigins,
		BrowserMetadataProbeOrigins:    browserMetadataProbeOrigins,
		Env:                            env,
		LogLevel:                       getEnv("LOG_LEVEL", "info"),
		OTelTracesExporter:             getEnv("OTEL_TRACES_EXPORTER", "none"),
		OTelServiceName:                getEnv("OTEL_SERVICE_NAME", "backend"),
		ServiceVersion:                 strings.TrimSpace(os.Getenv("SERVICE_VERSION")),
		OTelExporterOTLPEndpoint:       strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
		OTelExporterOTLPTracesEndpoint: strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")),
		OTelExporterOTLPProtocol:       strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_PROTOCOL")),
		PaddleAPIKey:                   os.Getenv("PADDLE_API_KEY"),
		PaddleWebhookSecret:            os.Getenv("PADDLE_WEBHOOK_SECRET"),
		PaddleClientToken:              os.Getenv("PADDLE_CLIENT_TOKEN"),
		PaddlePriceID:                  os.Getenv("PADDLE_PRICE_ID"),
		MediaUploadBaseURL:             strings.TrimRight(os.Getenv("MEDIA_UPLOAD_BASE_URL"), "/"),
		MediaUploadSigningSecret:       getEnv("MEDIA_UPLOAD_SIGNING_SECRET", jwtSecret),
		MediaStorageAccountName:        strings.TrimSpace(os.Getenv("MEDIA_STORAGE_ACCOUNT_NAME")),
		MediaStorageContainerName:      strings.TrimSpace(os.Getenv("MEDIA_STORAGE_CONTAINER_NAME")),
		MediaStorageAccountKey:         strings.TrimSpace(os.Getenv("AZURE_STORAGE_ACCOUNT_KEY")),
		NewRelicLicenseKey:             os.Getenv("NEW_RELIC_LICENSE_KEY"),
		NewRelicAppName:                getEnv("NEW_RELIC_APP_NAME", "ostgut-backend"),
	}

	if err := validatePaddleConfig(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func validatePaddleConfig(cfg *Config) error {
	if cfg.PaddleAPIKey == "" &&
		cfg.PaddleWebhookSecret == "" &&
		cfg.PaddleClientToken == "" &&
		cfg.PaddlePriceID == "" {
		return nil
	}

	if cfg.PaddleWebhookSecret == "" {
		return fmt.Errorf("PADDLE_WEBHOOK_SECRET must be set when Paddle billing is configured")
	}
	if cfg.PaddleClientToken == "" {
		return fmt.Errorf("PADDLE_CLIENT_TOKEN must be set when Paddle billing is configured")
	}
	if cfg.PaddlePriceID == "" {
		return fmt.Errorf("PADDLE_PRICE_ID must be set when Paddle billing is configured")
	}
	return nil
}
