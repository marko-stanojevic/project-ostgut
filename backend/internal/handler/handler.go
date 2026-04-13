// Package handler contains HTTP request handlers for the API.
package handler

import (
	"log/slog"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// Handler holds shared dependencies for HTTP handlers.
type Handler struct {
	store               *store.UserStore
	subStore            *store.SubscriptionStore
	stationStore        *store.StationStore
	log                 *slog.Logger
	paddleWebhookSecret string
	paddleClientToken   string
	paddlePriceID       string
}

// New creates a Handler with the given stores and logger.
func New(
	s *store.UserStore,
	sub *store.SubscriptionStore,
	stations *store.StationStore,
	log *slog.Logger,
	paddleWebhookSecret, paddleClientToken, paddlePriceID string,
) *Handler {
	return &Handler{
		store:               s,
		subStore:            sub,
		stationStore:        stations,
		log:                 log,
		paddleWebhookSecret: paddleWebhookSecret,
		paddleClientToken:   paddleClientToken,
		paddlePriceID:       paddlePriceID,
	}
}
