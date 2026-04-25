// Package main is the entry point for the Ostgut backend API server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/config"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/db"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/handler"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/radio"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
	"github.com/marko-stanojevic/project-ostgut/backend/migrations"
	nrgin "github.com/newrelic/go-agent/v3/integrations/nrgin"
	"github.com/newrelic/go-agent/v3/newrelic"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		// Logger isn't ready yet — write directly to stderr.
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	logLevel := slog.LevelInfo
	if cfg.LogLevel == "debug" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	logMediaStorageMode(
		logger,
		cfg.MediaUploadBaseURL,
		cfg.MediaStorageAccountName,
		cfg.MediaStorageContainerName,
		cfg.MediaStorageAccountKey,
	)
	warnIfSuspiciousMediaUploadBaseURL(logger, cfg.MediaUploadBaseURL)

	// Connect to Postgres
	pool, err := db.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	logger.Info("database connected")

	// Run migrations before starting the server.
	if err := runMigrations(logger, cfg.DatabaseURL); err != nil {
		logger.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	userStore := store.NewUserStore(pool)
	refreshTokenStore := store.NewRefreshTokenStore(pool)
	subStore := store.NewSubscriptionStore(pool)
	stationStore := store.NewStationStore(pool)
	stationStreamStore := store.NewStationStreamStore(pool)
	streamNowPlayingStore := store.NewStreamNowPlayingStore(pool)
	mediaAssetStore := store.NewMediaAssetStore(pool)
	h := handler.New(
		handler.Dependencies{
			UserStore:             userStore,
			RefreshTokenStore:     refreshTokenStore,
			SubscriptionStore:     subStore,
			StationStore:          stationStore,
			StationStreamStore:    stationStreamStore,
			StreamNowPlayingStore: streamNowPlayingStore,
			MediaAssetStore:       mediaAssetStore,
		},
		handler.Options{
			Log:                         logger,
			JWTSecret:                   cfg.JWTSecret,
			PaddleWebhookSecret:         cfg.PaddleWebhookSecret,
			PaddleClientToken:           cfg.PaddleClientToken,
			PaddlePriceID:               cfg.PaddlePriceID,
			MediaUploadBaseURL:          cfg.MediaUploadBaseURL,
			MediaUploadSecret:           cfg.MediaUploadSigningSecret,
			MediaStorageAccount:         cfg.MediaStorageAccountName,
			MediaStorageContainer:       cfg.MediaStorageContainerName,
			MediaStorageAccountKey:      cfg.MediaStorageAccountKey,
			BrowserMetadataProbeOrigins: cfg.BrowserMetadataProbeOrigins,
		},
	)

	// Start background station sync (Radio Browser ingestion).
	syncCtx, syncCancel := context.WithCancel(context.Background())
	defer syncCancel()
	syncer := radio.NewSyncer(stationStore, stationStreamStore, logger)
	go syncer.Run(syncCtx)

	// Start background stream re-probe (refreshes resolved_url, codec, health).
	prober := radio.NewProber(stationStreamStore, logger, cfg.BrowserMetadataProbeOrigins)
	go prober.Run(syncCtx)

	// Start metadata server-poller worker (drives upstream fetches for streams
	// whose resolver is `server`, with subscriber-driven scheduling).
	metaPoller := h.MetadataPoller()
	go metaPoller.Run(syncCtx)

	nrApp, err := newrelic.NewApplication(
		newrelic.ConfigAppName(cfg.NewRelicAppName),
		newrelic.ConfigLicense(cfg.NewRelicLicenseKey),
		newrelic.ConfigDistributedTracerEnabled(true),
		newrelic.ConfigAppLogForwardingEnabled(true),
	)
	if err != nil {
		logger.Warn("New Relic agent disabled", "reason", err)
		nrApp = nil
	}

	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	if nrApp != nil {
		router.Use(nrgin.Middleware(nrApp))
	}
	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	// Public routes
	router.GET("/health", handler.Health)
	router.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong"})
	})
	router.POST("/auth/login", h.Login)
	router.POST("/auth/register", h.Register)
	router.POST("/auth/oauth", h.OAuthLogin)
	router.POST("/auth/refresh", h.Refresh)
	router.POST("/auth/logout", h.Logout)
	router.POST("/auth/forgot-password", h.ForgotPassword)
	router.POST("/auth/reset-password", h.ResetPassword)

	// Station routes (public — no auth required)
	router.GET("/stations", h.ListStations)
	router.GET("/stations/filters", h.GetFilters)
	router.GET("/stations/:id", h.GetStation)
	router.GET("/stations/:id/now-playing", h.GetNowPlaying)
	router.GET("/stations/:id/now-playing/stream", h.StreamNowPlaying)
	router.GET("/search", h.SearchStations)

	// Paddle webhook (public — signature-verified internally)
	router.POST("/billing/webhook", h.PaddleWebhook)
	router.PUT("/media/upload/:id", h.UploadMediaObject)

	// Protected routes (JWT required)
	protected := router.Group("/")
	protected.Use(middleware.AuthMiddleware(logger, cfg.JWTSecret))
	{
		protected.GET("/users/me", h.GetProfile)
		protected.PUT("/users/me", h.UpdateProfile)
		protected.GET("/users/me/player-preferences", h.GetPlayerPreferences)
		protected.PUT("/users/me/player-preferences", h.UpdatePlayerPreferences)
		protected.GET("/billing/subscription", h.GetSubscription)
		protected.GET("/billing/checkout-config", h.GetCheckoutConfig)
		protected.POST("/media/upload-intent", h.CreateUploadIntent)
		protected.POST("/media/complete", h.CompleteUpload)
		protected.GET("/media/:id", h.GetMedia)
	}

	// Admin routes (JWT + role=admin required)
	admin := router.Group("/admin")
	admin.Use(middleware.AuthMiddleware(logger, cfg.JWTSecret))
	admin.Use(middleware.RequireRole(store.RoleAdmin))
	{
		admin.GET("/overview", h.AdminOverview)
		admin.GET("/stats", h.AdminStats)
		admin.GET("/stations", h.AdminListStations)
		admin.POST("/stations", h.AdminCreateStation)
		admin.POST("/stations/bulk", h.AdminBulkAction)
		admin.GET("/stations/:id", h.AdminGetStation)
		admin.POST("/stations/:id/streams/:streamID/probe", h.AdminProbeStationStream)
		admin.GET("/stations/:id/icon", h.AdminGetStationIcon)
		admin.PUT("/stations/:id", h.AdminUpdateStation)
		admin.GET("/users", h.AdminListUsers)
		admin.PUT("/users/:id/role", h.AdminSetUserRole)
	}

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		logger.Info("server starting", "port", cfg.Port, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server…")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("server forced to shutdown", "error", err)
	}
	logger.Info("server exited")
}

func warnIfSuspiciousMediaUploadBaseURL(logger *slog.Logger, mediaUploadBaseURL string) {
	if mediaUploadBaseURL == "" {
		logger.Warn("MEDIA_UPLOAD_BASE_URL is not set; media uploads will fail")
		return
	}

	parsed, err := url.Parse(mediaUploadBaseURL)
	if err != nil {
		logger.Warn("MEDIA_UPLOAD_BASE_URL is not a valid URL", "value", mediaUploadBaseURL, "error", err)
		return
	}

	host := strings.ToLower(parsed.Host)
	if !strings.Contains(host, ".blob.core.windows.net") {
		logger.Warn(
			"MEDIA_UPLOAD_BASE_URL does not look like an Azure Blob container URL",
			"value", mediaUploadBaseURL,
			"expected_host_pattern", "*.blob.core.windows.net",
		)
	}
}

func logMediaStorageMode(logger *slog.Logger, baseURL, storageAccount, storageContainer, accountKey string) {
	if storageAccount == "" || storageContainer == "" {
		logger.Info("media storage mode: base URL fallback")
		return
	}
	authMode := "DefaultAzureCredential (managed identity / az login)"
	if accountKey != "" {
		authMode = "shared key (local dev)"
	}
	logger.Info(
		"media storage mode: azure blob",
		"storage_account", storageAccount,
		"storage_container", storageContainer,
		"auth", authMode,
	)
	if baseURL == "" {
		logger.Warn("MEDIA_UPLOAD_BASE_URL is empty; media URLs in API responses will not be resolvable")
	}
}

func runMigrations(logger *slog.Logger, databaseURL string) error {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return err
	}

	// golang-migrate's pgx/v5 driver requires the "pgx5://" scheme.
	migrateURL := strings.Replace(databaseURL, "postgres://", "pgx5://", 1)

	m, err := migrate.NewWithSourceInstance("iofs", src, migrateURL)
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}

	version, _, _ := m.Version()
	logger.Info("migrations applied", "version", version)
	return nil
}
