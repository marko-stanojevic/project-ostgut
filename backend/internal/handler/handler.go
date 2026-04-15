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
	mediaAssetStore     *store.MediaAssetStore
	log                 *slog.Logger
	paddleWebhookSecret string
	paddleClientToken   string
	paddlePriceID       string
	mediaUploadBaseURL  string
	mediaUploadSecret   string
}

// New creates a Handler with the given stores and logger.
func New(
	s *store.UserStore,
	sub *store.SubscriptionStore,
	stations *store.StationStore,
	mediaAssets *store.MediaAssetStore,
	log *slog.Logger,
	paddleWebhookSecret, paddleClientToken, paddlePriceID, mediaUploadBaseURL, mediaUploadSecret string,
) *Handler {
	return &Handler{
		store:               s,
		subStore:            sub,
		stationStore:        stations,
		mediaAssetStore:     mediaAssets,
		log:                 log,
		paddleWebhookSecret: paddleWebhookSecret,
		paddleClientToken:   paddleClientToken,
		paddlePriceID:       paddlePriceID,
		mediaUploadBaseURL:  mediaUploadBaseURL,
		mediaUploadSecret:   mediaUploadSecret,
	}
}
