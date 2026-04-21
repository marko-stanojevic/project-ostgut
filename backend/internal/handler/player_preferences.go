package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

type playerPreferencesRequest struct {
	Volume    float64              `json:"volume"`
	Station   *store.PlayerStation `json:"station"`
	UpdatedAt string               `json:"updatedAt"`
}

// GetPlayerPreferences returns persisted player controls for the authenticated user.
// GET /users/me/player-preferences
func (h *Handler) GetPlayerPreferences(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	prefs, err := h.player.users.GetPlayerPreferences(c.Request.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		h.log.Error("get player preferences", "user_id", userID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"volume":    prefs.Volume,
		"station":   prefs.Station,
		"updatedAt": prefs.UpdatedAt.UTC().Format(time.RFC3339Nano),
	})
}

// UpdatePlayerPreferences stores player controls for the authenticated user.
// PUT /users/me/player-preferences
func (h *Handler) UpdatePlayerPreferences(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req playerPreferencesRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if req.Volume < 0 || req.Volume > 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "volume must be between 0 and 1"})
		return
	}

	updatedAt := time.Now().UTC()
	if req.UpdatedAt != "" {
		parsed, err := time.Parse(time.RFC3339Nano, req.UpdatedAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid updatedAt"})
			return
		}
		updatedAt = parsed.UTC()
	}

	result, err := h.player.users.UpdatePlayerPreferences(c.Request.Context(), userID, store.PlayerPreferences{
		Volume:    req.Volume,
		Station:   req.Station,
		UpdatedAt: updatedAt,
	})
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		h.log.Error("update player preferences", "user_id", userID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	message := "player preferences updated"
	if !result.Applied {
		message = "stale player preferences ignored"
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   message,
		"stale":     !result.Applied,
		"volume":    result.Preferences.Volume,
		"station":   result.Preferences.Station,
		"updatedAt": result.Preferences.UpdatedAt.Format(time.RFC3339Nano),
	})
}
