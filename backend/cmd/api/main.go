// Package main is the entry point for the Ostgut backend API server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
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
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
	"github.com/marko-stanojevic/project-ostgut/backend/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

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
	subStore := store.NewSubscriptionStore(pool)
	h := handler.New(userStore, subStore, logger, cfg.PaddleWebhookSecret, cfg.PaddleClientToken, cfg.PaddlePriceID)

	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
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
	router.POST("/auth/forgot-password", h.ForgotPassword)
	router.POST("/auth/reset-password", h.ResetPassword)
	router.POST("/auth/verify", handler.AuthVerify)

	// Paddle webhook (public — signature-verified internally)
	router.POST("/billing/webhook", h.PaddleWebhook)

	// Protected routes (JWT required)
	protected := router.Group("/")
	protected.Use(middleware.AuthMiddleware(logger, cfg.JWTSecret))
	{
		protected.GET("/users/me", h.GetProfile)
		protected.PUT("/users/me", h.UpdateProfile)
		protected.GET("/billing/subscription", h.GetSubscription)
		protected.GET("/billing/checkout-config", h.GetCheckoutConfig)
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
