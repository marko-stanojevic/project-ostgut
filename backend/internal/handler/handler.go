// Package handler contains HTTP request handlers for the API.
package handler

import (
	"log/slog"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// Handler holds shared dependencies for HTTP handlers.
type Handler struct {
	store *store.UserStore
	log   *slog.Logger
}

// New creates a Handler with the given store and logger.
func New(s *store.UserStore, log *slog.Logger) *Handler {
	return &Handler{store: s, log: log}
}
