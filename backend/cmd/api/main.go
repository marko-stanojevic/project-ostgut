// Package main is the entry point for the Ostgut backend API server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/config"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/handler"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())

	// Public routes (no auth required)
	router.GET("/health", handler.Health)
	router.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong"})
	})
	router.POST("/auth/verify", handler.AuthVerify)

	// Protected routes (auth required)
	// For now, auth middleware uses a placeholder JWT secret
	// In production, fetch Supabase JWKS for RS256 verification
	jwtSecret := os.Getenv("SUPABASE_ANON_KEY")
	if jwtSecret == "" {
		jwtSecret = "placeholder-secret" // Development only
	}

	protected := router.Group("/")
	protected.Use(middleware.AuthMiddleware(logger, jwtSecret))
	{
		protected.GET("/users/me", handler.GetProfile)
		protected.PUT("/users/me", handler.UpdateProfile)
	}

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// Graceful shutdown
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
