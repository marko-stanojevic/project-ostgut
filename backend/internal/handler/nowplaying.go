package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// GetNowPlaying handles GET /stations/:id/now-playing.
// It returns the currently-playing track metadata for the station's stream URL.
// Results are cached in the Fetcher for 30 s, so this endpoint is safe to poll
// from player clients on every track change.
func (h *Handler) GetNowPlaying(c *gin.Context) {
	id := c.Param("id")

	station, err := h.stationStore.GetByID(c.Request.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "station not found"})
		return
	}
	if err != nil {
		h.log.Error("get station for now-playing", "id", id, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if !station.MetadataEnabled {
		np := &metadata.NowPlaying{
			Source:    "",
			Supported: false,
			Status:    "disabled",
			ErrorCode: metadata.ErrorCodeDisabled,
			FetchedAt: time.Now(),
		}
		if station.MetadataError != nil {
			np.Error = *station.MetadataError
		}
		if station.MetadataErrorCode != nil {
			np.ErrorCode = *station.MetadataErrorCode
		}
		c.JSON(http.StatusOK, np)
		return
	}

	streamURL := station.StreamURL
	streams, err := h.stationStreamStore.ListByStationID(c.Request.Context(), station.ID)
	if err != nil {
		h.log.Warn("list station streams for now-playing", "station_id", station.ID, "error", err)
	} else {
		for _, stream := range streams {
			if !stream.IsActive {
				continue
			}
			candidate := strings.TrimSpace(stream.ResolvedURL)
			if candidate == "" {
				candidate = strings.TrimSpace(stream.URL)
			}
			if candidate != "" {
				streamURL = candidate
				break
			}
		}
	}

	np := h.metaFetcher.Fetch(c.Request.Context(), streamURL, metadata.Config{
		Enabled: station.MetadataEnabled,
		Type:    station.MetadataType,
	})

	var metadataError *string
	var metadataErrorCode *string
	if np.Status == "ok" {
		metadataError = nil
		metadataErrorCode = nil
	} else if np.Error != "" {
		errMsg := np.Error
		metadataError = &errMsg
	}
	if np.ErrorCode != "" {
		errCode := np.ErrorCode
		metadataErrorCode = &errCode
	}

	if err := h.stationStore.UpdateMetadataHealth(c.Request.Context(), station.ID, metadataError, metadataErrorCode, &np.FetchedAt); err != nil {
		h.log.Warn("update metadata health", "station_id", station.ID, "error", err)
	}

	c.JSON(http.StatusOK, np)
}
