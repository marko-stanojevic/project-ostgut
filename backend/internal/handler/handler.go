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
	"github.com/marko-stanojevic/project-ostgut/backend/internal/radio"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// Dependencies groups the stores required by HTTP handlers.
type Dependencies struct {
	UserStore             *store.UserStore
	RefreshTokenStore     *store.RefreshTokenStore
	SubscriptionStore     *store.SubscriptionStore
	StationStore          *store.StationStore
	StationStreamStore    *store.StationStreamStore
	StreamNowPlayingStore *store.StreamNowPlayingStore
	MediaAssetStore       *store.MediaAssetStore
	DiagnosticsStore      *store.DiagnosticsStore
	StationSyncer         *radio.Syncer
	StreamProber          *radio.Prober
}

// Options groups runtime settings used by handlers.
type Options struct {
	Log                         *slog.Logger
	JWTSecret                   string
	OAuthSharedSecret           string
	EnforcePublicQueryAllowlist bool
	PublicAPIBaseURL            string
	PaddleWebhookSecret         string
	PaddleClientToken           string
	PaddlePriceID               string
	MediaUploadBaseURL          string
	MediaUploadSecret           string
	MediaStorageAccount         string
	MediaStorageContainer       string
	MediaStorageAccountKey      string
	BrowserMetadataProbeOrigins []string
}

type playerPreferencesStore interface {
	GetPlayerPreferences(ctx context.Context, id string) (*store.PlayerPreferences, error)
	UpdatePlayerPreferences(ctx context.Context, id string, prefs store.PlayerPreferences) (*store.PlayerPreferencesWriteResult, error)
}

type authHandlers struct {
	users       *store.UserStore
	refresh     *store.RefreshTokenStore
	jwtSecret   string
	oauthSecret string
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
	nowPlaying        *store.StreamNowPlayingStore
	metaFetcher       *metadata.Fetcher
	metaPoller        *MetadataPoller
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
	users               *store.UserStore
	refresh             *store.RefreshTokenStore
	subscriptions       *store.SubscriptionStore
	stations            *store.StationStore
	streams             *store.StationStreamStore
	nowPlaying          *store.StreamNowPlayingStore
	media               *store.MediaAssetStore
	diagnostics         *store.DiagnosticsStore
	stationSyncer       *radio.Syncer
	streamProber        *radio.Prober
	metaFetcher         *metadata.Fetcher
	streamProbeClient   *http.Client
	metadataRouter      *radio.MetadataRouter
	browserProbeOrigins []string
}

// Handler holds grouped domain dependencies for HTTP handlers.
type Handler struct {
	auth                        authHandlers
	user                        userHandlers
	player                      playerHandlers
	billing                     billingHandlers
	station                     stationHandlers
	media                       mediaHandlers
	admin                       adminHandlers
	mediaCleaner                *MediaCleaner
	enforcePublicQueryAllowlist bool
	publicAPIBaseURL            string
	log                         *slog.Logger
	startedAt                   time.Time
	mediaBlobClientMu           sync.Mutex
	mediaBlobClient             *azblob.Client
}

// New creates a Handler with grouped dependencies and runtime options.
func New(deps Dependencies, opts Options) *Handler {
	streamProbeClient := &http.Client{Timeout: 8 * time.Second}
	metadataRouter := radio.NewMetadataRouter(streamProbeClient, opts.BrowserMetadataProbeOrigins)
	metaFetcher := metadata.NewFetcher(opts.Log)
	metaPoller := NewMetadataPoller(deps.StationStreamStore, deps.StreamNowPlayingStore, metaFetcher, opts.Log, opts.BrowserMetadataProbeOrigins)
	h := &Handler{
		auth: authHandlers{
			users:       deps.UserStore,
			refresh:     deps.RefreshTokenStore,
			jwtSecret:   opts.JWTSecret,
			oauthSecret: opts.OAuthSharedSecret,
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
			nowPlaying:        deps.StreamNowPlayingStore,
			metaFetcher:       metaFetcher,
			metaPoller:        metaPoller,
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
			users:               deps.UserStore,
			refresh:             deps.RefreshTokenStore,
			subscriptions:       deps.SubscriptionStore,
			stations:            deps.StationStore,
			streams:             deps.StationStreamStore,
			nowPlaying:          deps.StreamNowPlayingStore,
			media:               deps.MediaAssetStore,
			diagnostics:         deps.DiagnosticsStore,
			stationSyncer:       deps.StationSyncer,
			streamProber:        deps.StreamProber,
			metaFetcher:         metaFetcher,
			streamProbeClient:   streamProbeClient,
			metadataRouter:      metadataRouter,
			browserProbeOrigins: append([]string(nil), opts.BrowserMetadataProbeOrigins...),
		},
		enforcePublicQueryAllowlist: opts.EnforcePublicQueryAllowlist,
		publicAPIBaseURL:            opts.PublicAPIBaseURL,
		log:                         opts.Log,
		startedAt:                   time.Now().UTC(),
	}
	h.mediaCleaner = newMediaCleaner(deps.MediaAssetStore, h.deleteMediaBlob, opts.Log)
	return h
}

// MetadataPoller returns the shared MetadataPoller instance. main.go calls
// this to start the poller goroutine after the handler is constructed.
func (h *Handler) MetadataPoller() *MetadataPoller {
	return h.station.metaPoller
}

// MediaCleaner returns the shared MediaCleaner instance. main.go calls
// this to start the cleaner goroutine after the handler is constructed.
func (h *Handler) MediaCleaner() *MediaCleaner {
	return h.mediaCleaner
}
