// Package handler contains HTTP request handlers for the API.
package handler

import (
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// Handler holds shared dependencies for HTTP handlers.
type Handler struct {
	store                  *store.UserStore
	subStore               *store.SubscriptionStore
	stationStore           *store.StationStore
	stationStreamStore     *store.StationStreamStore
	mediaAssetStore        *store.MediaAssetStore
	metaFetcher            *metadata.Fetcher
	streamProbeClient      *http.Client
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
	stationStreams *store.StationStreamStore,
	mediaAssets *store.MediaAssetStore,
	log *slog.Logger,
	paddleWebhookSecret, paddleClientToken, paddlePriceID, mediaUploadBaseURL, mediaUploadSecret,
	mediaStorageAccount, mediaStorageContainer, mediaStorageAccountKey string,
) *Handler {
	return &Handler{
		store:                  s,
		subStore:               sub,
		stationStore:           stations,
		stationStreamStore:     stationStreams,
		mediaAssetStore:        mediaAssets,
		metaFetcher:            metadata.NewFetcher(log),
		streamProbeClient:      &http.Client{Timeout: 8 * time.Second},
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
