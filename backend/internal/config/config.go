// Package config loads application configuration from environment variables.
package config

import (
	"fmt"
	"os"
)

// Config holds all runtime configuration for the service.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port string

	// SupabaseURL is the base REST URL for the Supabase project.
	SupabaseURL string

	// SupabaseAnonKey is the anonymous / public API key used for Supabase.
	SupabaseAnonKey string

	// SupabaseServiceKey is the privileged service-role key (keep secret).
	SupabaseServiceKey string

	// Env is the deployment environment (local | staging | production).
	Env string
}

// Load reads configuration from environment variables, returning an error when
// required values are absent.
func Load() (*Config, error) {
	port := getEnv("PORT", "8080")
	supabaseURL := os.Getenv("SUPABASE_URL")
	if supabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL must be set")
	}

	supabaseAnonKey := os.Getenv("SUPABASE_ANON_KEY")
	if supabaseAnonKey == "" {
		return nil, fmt.Errorf("SUPABASE_ANON_KEY must be set")
	}

	return &Config{
		Port:               port,
		SupabaseURL:        supabaseURL,
		SupabaseAnonKey:    supabaseAnonKey,
		SupabaseServiceKey: os.Getenv("SUPABASE_SERVICE_KEY"),
		Env:                getEnv("ENV", "local"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
