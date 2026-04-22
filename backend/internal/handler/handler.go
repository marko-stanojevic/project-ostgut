// Package handler contains HTTP request handlers for the API.
package handler

import (
	"context"
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

type playerPreferencesStore interface {
	GetPlayerPreferences(ctx context.Context, id string) (*store.PlayerPreferences, error)
	UpdatePlayerPreferences(ctx context.Context, id string, prefs store.PlayerPreferences) (*store.PlayerPreferencesWriteResult, error)
}

type authHandlers struct {
	users     *store.UserStore
	jwtSecret string
}

type userHandlers struct {
	users *store.UserStore
	media *store.MediaAssetStore
}

type playerHandlers struct {
	users playerPreferencesStore
}

type billingHandlers struct {
	subscriptions *store.SubscriptionStore
	webhookSecret string
	clientToken   string
	priceID       string
}

type stationHandlers struct {
	stations          *store.StationStore
	streams           *store.StationStreamStore
	metaFetcher       *metadata.Fetcher
	streamProbeClient *http.Client
}

type mediaConfig struct {
	uploadBaseURL     string
	uploadSecret      string
	storageAccount    string
	storageContainer  string
	storageAccountKey string
}

type mediaHandlers struct {
	users    *store.UserStore
	stations *store.StationStore
	assets   *store.MediaAssetStore
	config   mediaConfig
}

type adminHandlers struct {
	users             *store.UserStore
	stations          *store.StationStore
	streams           *store.StationStreamStore
	media             *store.MediaAssetStore
	metaFetcher       *metadata.Fetcher
	streamProbeClient *http.Client
}

// Handler holds grouped domain dependencies for HTTP handlers.
type Handler struct {
	auth              authHandlers
	user              userHandlers
	player            playerHandlers
	billing           billingHandlers
	station           stationHandlers
	media             mediaHandlers
	admin             adminHandlers
	log               *slog.Logger
	mediaBlobClientMu sync.Mutex
	mediaBlobClient   *azblob.Client
}

// New creates a Handler with grouped dependencies and runtime options.
func New(deps Dependencies, opts Options) *Handler {
	streamProbeClient := &http.Client{Timeout: 8 * time.Second}
	metaFetcher := metadata.NewFetcher(opts.Log)
	return &Handler{
		auth: authHandlers{
			users:     deps.UserStore,
			jwtSecret: opts.JWTSecret,
		},
		user: userHandlers{
			users: deps.UserStore,
			media: deps.MediaAssetStore,
		},
		player: playerHandlers{
			users: deps.UserStore,
		},
		billing: billingHandlers{
			subscriptions: deps.SubscriptionStore,
			webhookSecret: opts.PaddleWebhookSecret,
			clientToken:   opts.PaddleClientToken,
			priceID:       opts.PaddlePriceID,
		},
		station: stationHandlers{
			stations:          deps.StationStore,
			streams:           deps.StationStreamStore,
			metaFetcher:       metaFetcher,
			streamProbeClient: streamProbeClient,
		},
		media: mediaHandlers{
			users:    deps.UserStore,
			stations: deps.StationStore,
			assets:   deps.MediaAssetStore,
			config: mediaConfig{
				uploadBaseURL:     opts.MediaUploadBaseURL,
				uploadSecret:      opts.MediaUploadSecret,
				storageAccount:    opts.MediaStorageAccount,
				storageContainer:  opts.MediaStorageContainer,
				storageAccountKey: opts.MediaStorageAccountKey,
			},
		},
		admin: adminHandlers{
			users:             deps.UserStore,
			stations:          deps.StationStore,
			streams:           deps.StationStreamStore,
			media:             deps.MediaAssetStore,
			metaFetcher:       metaFetcher,
			streamProbeClient: streamProbeClient,
		},
		log: opts.Log,
	}
}
