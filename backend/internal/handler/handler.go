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

// Dependencies groups the stores required by HTTP handlers.
type Dependencies struct {
	UserStore          *store.UserStore
	SubscriptionStore  *store.SubscriptionStore
	StationStore       *store.StationStore
	StationStreamStore *store.StationStreamStore
	MediaAssetStore    *store.MediaAssetStore
}

// Options groups runtime settings used by handlers.
type Options struct {
	Log                    *slog.Logger
	JWTSecret              string
	PaddleWebhookSecret    string
	PaddleClientToken      string
	PaddlePriceID          string
	MediaUploadBaseURL     string
	MediaUploadSecret      string
	MediaStorageAccount    string
	MediaStorageContainer  string
	MediaStorageAccountKey string
}

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
	jwtSecret              string
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

// New creates a Handler with grouped dependencies and runtime options.
func New(deps Dependencies, opts Options) *Handler {
	return &Handler{
		store:                  deps.UserStore,
		subStore:               deps.SubscriptionStore,
		stationStore:           deps.StationStore,
		stationStreamStore:     deps.StationStreamStore,
		mediaAssetStore:        deps.MediaAssetStore,
		metaFetcher:            metadata.NewFetcher(opts.Log),
		streamProbeClient:      &http.Client{Timeout: 8 * time.Second},
		log:                    opts.Log,
		jwtSecret:              opts.JWTSecret,
		paddleWebhookSecret:    opts.PaddleWebhookSecret,
		paddleClientToken:      opts.PaddleClientToken,
		paddlePriceID:          opts.PaddlePriceID,
		mediaUploadBaseURL:     opts.MediaUploadBaseURL,
		mediaUploadSecret:      opts.MediaUploadSecret,
		mediaStorageAccount:    opts.MediaStorageAccount,
		mediaStorageContainer:  opts.MediaStorageContainer,
		mediaStorageAccountKey: opts.MediaStorageAccountKey,
	}
}
