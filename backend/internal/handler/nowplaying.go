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
// Responses are served from the latest stored snapshot. When the snapshot is
// stale, the handler schedules an async refresh and immediately returns the
// cached payload so playback UI never waits on upstream metadata probes.
func (h *Handler) GetNowPlaying(c *gin.Context) {
	id := c.Param("id")
	requestedStreamID := strings.TrimSpace(c.Query("stream_id"))

	station, err := h.station.stations.GetByID(c.Request.Context(), id)
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
	var selectedStream *store.StationStream
	streams, err := h.station.streams.ListByStationID(c.Request.Context(), station.ID)
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
					selectedStream = stream
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
					selectedStream = stream
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
		if selectedStream != nil && selectedStream.MetadataError != nil {
			np.Error = *selectedStream.MetadataError
		}
		if selectedStream != nil && selectedStream.MetadataErrorCode != nil {
			np.ErrorCode = *selectedStream.MetadataErrorCode
		}
		c.JSON(http.StatusOK, np)
		return
	}

	if selectedStream == nil && selectedStreamID != "" {
		selectedStream = &store.StationStream{
			ID:              selectedStreamID,
			URL:             streamURL,
			ResolvedURL:     streamURL,
			MetadataEnabled: metadataEnabled,
			MetadataType:    metadata.TypeAuto,
		}
	}

	if selectedStream != nil && h.station.metaRefresher.NeedsRefresh(selectedStream) {
		h.station.metaRefresher.RefreshAsync(selectedStream)
	}

	np := buildNowPlayingResponse(selectedStream)
	c.JSON(http.StatusOK, np)
}

func buildNowPlayingResponse(stream *store.StationStream) *metadata.NowPlaying {
	now := time.Now()
	if stream == nil {
		return &metadata.NowPlaying{
			Source:    "",
			Supported: false,
			Status:    "unsupported",
			ErrorCode: metadata.ErrorCodeNoMeta,
			FetchedAt: now,
		}
	}

	fetchedAt := now
	if stream.MetadataLastFetchedAt != nil && !stream.MetadataLastFetchedAt.IsZero() {
		fetchedAt = *stream.MetadataLastFetchedAt
	}

	source := ""
	if stream.MetadataSource != nil {
		source = strings.TrimSpace(*stream.MetadataSource)
	}

	if title := strings.TrimSpace(stream.NowPlayingTitle); title != "" {
		return &metadata.NowPlaying{
			Title:     title,
			Artist:    strings.TrimSpace(stream.NowPlayingArtist),
			Song:      strings.TrimSpace(stream.NowPlayingSong),
			Source:    source,
			Supported: true,
			Status:    "ok",
			FetchedAt: fetchedAt,
		}
	}

	errorCode := ""
	if stream.MetadataErrorCode != nil {
		errorCode = strings.TrimSpace(*stream.MetadataErrorCode)
	}
	errorMessage := ""
	if stream.MetadataError != nil {
		errorMessage = strings.TrimSpace(*stream.MetadataError)
	}

	status := "unsupported"
	switch errorCode {
	case "", metadata.ErrorCodeNoMeta:
		status = "unsupported"
	default:
		status = "error"
	}

	return &metadata.NowPlaying{
		Source:    source,
		Supported: false,
		Status:    status,
		ErrorCode: errorCode,
		Error:     errorMessage,
		FetchedAt: fetchedAt,
	}
}
