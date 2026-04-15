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
		Port:                     port,
		DatabaseURL:              databaseURL,
		JWTSecret:                jwtSecret,
		AllowedOrigins:           allowedOrigins,
		Env:                      getEnv("ENV", "local"),
		PaddleAPIKey:             os.Getenv("PADDLE_API_KEY"),
		PaddleWebhookSecret:      os.Getenv("PADDLE_WEBHOOK_SECRET"),
		PaddleClientToken:        os.Getenv("PADDLE_CLIENT_TOKEN"),
		PaddlePriceID:            os.Getenv("PADDLE_PRICE_ID"),
		MediaUploadBaseURL:       strings.TrimRight(os.Getenv("MEDIA_UPLOAD_BASE_URL"), "/"),
		MediaUploadSigningSecret: getEnv("MEDIA_UPLOAD_SIGNING_SECRET", jwtSecret),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
