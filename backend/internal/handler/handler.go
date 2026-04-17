// Package handler contains HTTP request handlers for the API.
package handler

import (
	"log/slog"
	"sync"

	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// Handler holds shared dependencies for HTTP handlers.
type Handler struct {
	store                  *store.UserStore
	subStore               *store.SubscriptionStore
	stationStore           *store.StationStore
	mediaAssetStore        *store.MediaAssetStore
	metaFetcher            *metadata.Fetcher
	log                    *slog.Logger
	paddleWebhookSecret    string
	paddleClientToken      string
	paddlePriceID          string
	mediaUploadBaseURL     string
	mediaUploadSecret      string
	mediaStorageAccount    string
	mediaStorageContainer  string
	mediaStorageAccountKey string // local dev only; takes priority over managed identity / az login
	mediaBlobClientMu      sync.Mutex
	mediaBlobClient        *azblob.Client
}

// New creates a Handler with the given stores and logger.
func New(
	s *store.UserStore,
	sub *store.SubscriptionStore,
	stations *store.StationStore,
	mediaAssets *store.MediaAssetStore,
	log *slog.Logger,
	paddleWebhookSecret, paddleClientToken, paddlePriceID, mediaUploadBaseURL, mediaUploadSecret,
	mediaStorageAccount, mediaStorageContainer, mediaStorageAccountKey string,
) *Handler {
	return &Handler{
		store:                  s,
		subStore:               sub,
		stationStore:           stations,
		mediaAssetStore:        mediaAssets,
		metaFetcher:            metadata.NewFetcher(log),
		log:                    log,
		paddleWebhookSecret:    paddleWebhookSecret,
		paddleClientToken:      paddleClientToken,
		paddlePriceID:          paddlePriceID,
		mediaUploadBaseURL:     mediaUploadBaseURL,
		mediaUploadSecret:      mediaUploadSecret,
		mediaStorageAccount:    mediaStorageAccount,
		mediaStorageContainer:  mediaStorageContainer,
		mediaStorageAccountKey: mediaStorageAccountKey,
	}
}
