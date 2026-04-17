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

	allowedOrigins := strings.Split(
		getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
		",",
	)

	return &Config{
		Port:                      port,
		DatabaseURL:               databaseURL,
		JWTSecret:                 jwtSecret,
		AllowedOrigins:            allowedOrigins,
		Env:                       getEnv("ENV", "local"),
		LogLevel:                  getEnv("LOG_LEVEL", "info"),
		PaddleAPIKey:              os.Getenv("PADDLE_API_KEY"),
		PaddleWebhookSecret:       os.Getenv("PADDLE_WEBHOOK_SECRET"),
		PaddleClientToken:         os.Getenv("PADDLE_CLIENT_TOKEN"),
		PaddlePriceID:             os.Getenv("PADDLE_PRICE_ID"),
		MediaUploadBaseURL:        strings.TrimRight(os.Getenv("MEDIA_UPLOAD_BASE_URL"), "/"),
		MediaUploadSigningSecret:  getEnv("MEDIA_UPLOAD_SIGNING_SECRET", jwtSecret),
		MediaStorageAccountName:   strings.TrimSpace(os.Getenv("MEDIA_STORAGE_ACCOUNT_NAME")),
		MediaStorageContainerName: strings.TrimSpace(os.Getenv("MEDIA_STORAGE_CONTAINER_NAME")),
		MediaStorageAccountKey:    strings.TrimSpace(os.Getenv("AZURE_STORAGE_ACCOUNT_KEY")),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
