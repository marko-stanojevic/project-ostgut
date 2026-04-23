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

	// JWTSecret is the secret used to validate Auth.js HS256 tokens.
	// Must match AUTH_SECRET in the frontend.
	JWTSecret string

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

	allowedOrigins := splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:3000"))
	browserMetadataProbeOrigins := splitCSV(getEnv("BROWSER_METADATA_PROBE_ORIGINS", strings.Join(allowedOrigins, ",")))

	cfg := &Config{
		Port:                        port,
		DatabaseURL:                 databaseURL,
		JWTSecret:                   jwtSecret,
		AllowedOrigins:              allowedOrigins,
		BrowserMetadataProbeOrigins: browserMetadataProbeOrigins,
		Env:                         getEnv("ENV", "local"),
		LogLevel:                    getEnv("LOG_LEVEL", "info"),
		PaddleAPIKey:                os.Getenv("PADDLE_API_KEY"),
		PaddleWebhookSecret:         os.Getenv("PADDLE_WEBHOOK_SECRET"),
		PaddleClientToken:           os.Getenv("PADDLE_CLIENT_TOKEN"),
		PaddlePriceID:               os.Getenv("PADDLE_PRICE_ID"),
		MediaUploadBaseURL:          strings.TrimRight(os.Getenv("MEDIA_UPLOAD_BASE_URL"), "/"),
		MediaUploadSigningSecret:    getEnv("MEDIA_UPLOAD_SIGNING_SECRET", jwtSecret),
		MediaStorageAccountName:     strings.TrimSpace(os.Getenv("MEDIA_STORAGE_ACCOUNT_NAME")),
		MediaStorageContainerName:   strings.TrimSpace(os.Getenv("MEDIA_STORAGE_CONTAINER_NAME")),
		MediaStorageAccountKey:      strings.TrimSpace(os.Getenv("AZURE_STORAGE_ACCOUNT_KEY")),
		NewRelicLicenseKey:          os.Getenv("NEW_RELIC_LICENSE_KEY"),
		NewRelicAppName:             getEnv("NEW_RELIC_APP_NAME", "ostgut-backend"),
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
