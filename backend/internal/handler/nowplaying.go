package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// GetNowPlaying handles GET /stations/:id/now-playing.
// Returns the current now-playing snapshot from stream_now_playing. For
// resolver=server, if the data is stale and no poll loop is active, triggers
// a one-shot async refresh.
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

	selectedStream := resolveStream(c, h, station, requestedStreamID)
	if selectedStream == nil {
		h.log.Info("now-playing request routed", append(requestLogAttrs(c.Request.Context()),
			"event", "now_playing_request_routed",
			"station_id", station.ID,
			"requested_stream_id", requestedStreamID,
			"metadata_delivery", metadata.DeliveryNone,
			"metadata_resolver", metadata.ResolverNone,
			"error_code", metadata.ErrorCodeNoMeta,
		)...)
		c.JSON(http.StatusOK, &Snapshot{Status: "unsupported", ErrorCode: metadata.ErrorCodeNoMeta, FetchedAt: time.Now().UTC()})
		return
	}
	metadataEnabled := metadataModeEnabled(selectedStream.MetadataMode)
	plan := metadata.BuildStreamPlan(metadata.StreamPlanInput{
		Enabled:     metadataEnabled,
		Type:        selectedStream.MetadataType,
		SourceHint:  stringValue(selectedStream.MetadataSource),
		MetadataURL: stringValue(selectedStream.MetadataURL),
		Resolver:    metadataResolverForResponse(selectedStream),
		Kind:        selectedStream.Kind,
		Container:   selectedStream.Container,
		StreamURL:   firstNonEmpty(selectedStream.ResolvedURL, selectedStream.URL),
	})

	if !metadataEnabled || plan.Delivery == metadata.DeliveryNone {
		status := "unsupported"
		errorCode := metadata.ErrorCodeNoMeta
		if !metadataEnabled {
			status = "disabled"
			errorCode = metadata.ErrorCodeDisabled
		}
		h.log.Info("now-playing request routed", append(requestLogAttrs(c.Request.Context()),
			"event", "now_playing_request_routed",
			"station_id", station.ID,
			"stream_id", selectedStream.ID,
			"requested_stream_id", requestedStreamID,
			"metadata_delivery", plan.Delivery,
			"metadata_resolver", plan.Resolver,
			"error_code", errorCode,
			"status", status,
		)...)
		c.JSON(http.StatusOK, &Snapshot{Status: status, ErrorCode: errorCode, FetchedAt: time.Now().UTC()})
		return
	}

	np, err := h.station.nowPlaying.Get(c.Request.Context(), selectedStream.ID)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		h.log.Error("get now playing", "stream_id", selectedStream.ID, "error", err)
	}
	snap := snapshotFromStore(np)

	// For server-resolved streams with a stale snapshot, kick off a one-shot
	// refresh outside the request path. If a poll loop is already active for
	// this stream (SSE listeners), it will refresh on cadence instead.
	if plan.Delivery == metadata.DeliverySSE &&
		(np == nil || time.Since(np.FetchedAt) > 30*time.Second) {
		h.station.metaPoller.RefreshOnce(c.Request.Context(), selectedStream)
	}
	h.log.Info("now-playing request routed", append(requestLogAttrs(c.Request.Context()),
		"event", "now_playing_request_routed",
		"station_id", station.ID,
		"stream_id", selectedStream.ID,
		"requested_stream_id", requestedStreamID,
		"metadata_delivery", plan.Delivery,
		"metadata_resolver", plan.Resolver,
		"snapshot_status", snap.Status,
		"snapshot_age_ms", snapshotAgeMillis(np),
	)...)

	c.JSON(http.StatusOK, snap)
}

// StreamNowPlaying handles GET /stations/:id/now-playing/stream (SSE).
// It subscribes to the MetadataPoller for the selected stream and pushes
// updates to the client as text/event-stream events.
func (h *Handler) StreamNowPlaying(c *gin.Context) {
	id := c.Param("id")
	requestedStreamID := strings.TrimSpace(c.Query("stream_id"))

	station, err := h.station.stations.GetByID(c.Request.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "station not found"})
		return
	}
	if err != nil {
		h.log.Error("sse: get station", "id", id, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	selectedStream := resolveStream(c, h, station, requestedStreamID)
	if selectedStream == nil || !metadataModeEnabled(selectedStream.MetadataMode) {
		c.JSON(http.StatusOK, gin.H{"error": "metadata not available for this stream"})
		return
	}
	metadataEnabled := metadataModeEnabled(selectedStream.MetadataMode)
	plan := metadata.BuildStreamPlan(metadata.StreamPlanInput{
		Enabled:     metadataEnabled,
		Type:        selectedStream.MetadataType,
		SourceHint:  stringValue(selectedStream.MetadataSource),
		MetadataURL: stringValue(selectedStream.MetadataURL),
		Resolver:    metadataResolverForResponse(selectedStream),
		Kind:        selectedStream.Kind,
		Container:   selectedStream.Container,
		StreamURL:   firstNonEmpty(selectedStream.ResolvedURL, selectedStream.URL),
	})

	if plan.Delivery != metadata.DeliverySSE {
		h.log.Info("now-playing stream skipped", append(requestLogAttrs(c.Request.Context()),
			"event", "now_playing_sse_skipped",
			"station_id", station.ID,
			"stream_id", selectedStream.ID,
			"requested_stream_id", requestedStreamID,
			"metadata_delivery", plan.Delivery,
			"metadata_resolver", plan.Resolver,
		)...)
		c.JSON(http.StatusOK, gin.H{"error": "stream uses client resolver; no SSE available"})
		return
	}

	sub, unsub, last := h.station.metaPoller.Subscribe(selectedStream)
	if sub == nil {
		h.log.Info("now-playing stream skipped", append(requestLogAttrs(c.Request.Context()),
			"event", "now_playing_sse_skipped",
			"station_id", station.ID,
			"stream_id", selectedStream.ID,
			"requested_stream_id", requestedStreamID,
			"metadata_delivery", plan.Delivery,
			"metadata_resolver", plan.Resolver,
			"reason", "subscription_unavailable",
		)...)
		c.JSON(http.StatusOK, gin.H{"error": "subscription not available"})
		return
	}
	defer unsub()
	h.log.Info("now-playing stream subscribed", append(requestLogAttrs(c.Request.Context()),
		"event", "now_playing_sse_subscribed",
		"station_id", station.ID,
		"stream_id", selectedStream.ID,
		"requested_stream_id", requestedStreamID,
		"metadata_delivery", plan.Delivery,
		"metadata_resolver", plan.Resolver,
	)...)

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Flush()

	// Immediately push the most recent snapshot so the client doesn't wait
	// for the next poll cycle.
	if last != nil {
		writeSSE(c, *last)
	}

	flusher, _ := c.Writer.(http.Flusher)
	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case snap, ok := <-sub:
			if !ok {
				return
			}
			writeSSE(c, snap)
			if flusher != nil {
				flusher.Flush()
			}
		}
	}
}

func snapshotAgeMillis(np *store.StreamNowPlaying) int64 {
	if np == nil || np.FetchedAt.IsZero() {
		return -1
	}
	return time.Since(np.FetchedAt).Milliseconds()
}

func writeSSE(c *gin.Context, snap Snapshot) {
	data, _ := json.Marshal(snap)
	fmt.Fprintf(c.Writer, "data: %s\n\n", data)
}

func resolveStream(c *gin.Context, h *Handler, station *store.Station, requestedStreamID string) *store.StationStream {
	streams, err := h.station.streams.ListByStationID(c.Request.Context(), station.ID)
	if err != nil {
		h.log.Warn("list station streams for now-playing", "station_id", station.ID, "error", err)
		return nil
	}

	if requestedStreamID != "" {
		for _, stream := range streams {
			if stream.ID == requestedStreamID && stream.IsActive {
				return stream
			}
		}
	}

	for _, stream := range streams {
		if stream.IsActive {
			return stream
		}
	}
	return nil
}
