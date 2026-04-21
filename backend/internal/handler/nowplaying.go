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
	requestedStreamID := strings.TrimSpace(c.Query("stream_id"))

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

	streamURL := station.StreamURL
	selectedStreamID := ""
	metadataEnabled := true
	metadataType := metadata.TypeAuto
	var metadataError *string
	var metadataErrorCode *string
	streams, err := h.stationStreamStore.ListByStationID(c.Request.Context(), station.ID)
	if err != nil {
		h.log.Warn("list station streams for now-playing", "station_id", station.ID, "error", err)
	} else {
		if requestedStreamID != "" {
			for _, stream := range streams {
				if stream.ID != requestedStreamID || !stream.IsActive {
					continue
				}
				candidate := strings.TrimSpace(stream.ResolvedURL)
				if candidate == "" {
					candidate = strings.TrimSpace(stream.URL)
				}
				if candidate != "" {
					streamURL = candidate
					selectedStreamID = stream.ID
					metadataEnabled = stream.MetadataEnabled
					metadataType = stream.MetadataType
					metadataError = stream.MetadataError
					metadataErrorCode = stream.MetadataErrorCode
					break
				}
			}
		}

		if streamURL == station.StreamURL {
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
					selectedStreamID = stream.ID
					metadataEnabled = stream.MetadataEnabled
					metadataType = stream.MetadataType
					metadataError = stream.MetadataError
					metadataErrorCode = stream.MetadataErrorCode
					break
				}
			}
		}
	}

	if !metadataEnabled {
		np := &metadata.NowPlaying{
			Source:    "",
			Supported: false,
			Status:    "disabled",
			ErrorCode: metadata.ErrorCodeDisabled,
			FetchedAt: time.Now(),
		}
		if metadataError != nil {
			np.Error = *metadataError
		}
		if metadataErrorCode != nil {
			np.ErrorCode = *metadataErrorCode
		}
		c.JSON(http.StatusOK, np)
		return
	}

	np := h.metaFetcher.Fetch(c.Request.Context(), streamURL, metadata.Config{
		Enabled: metadataEnabled,
		Type:    metadataType,
	})

	var resultMetadataError *string
	var resultMetadataErrorCode *string
	if np.Status == "ok" {
		resultMetadataError = nil
		resultMetadataErrorCode = nil
	} else if np.Error != "" {
		errMsg := np.Error
		resultMetadataError = &errMsg
	}
	if np.ErrorCode != "" {
		errCode := np.ErrorCode
		resultMetadataErrorCode = &errCode
	}

	if selectedStreamID != "" {
		if err := h.stationStreamStore.UpdateMetadataHealth(c.Request.Context(), selectedStreamID, resultMetadataError, resultMetadataErrorCode, &np.FetchedAt); err != nil {
			h.log.Warn("update metadata health", "station_id", station.ID, "stream_id", selectedStreamID, "error", err)
		}
	}

	c.JSON(http.StatusOK, np)
}
