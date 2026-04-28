// admin.go hosts the admin/editor station-management HTTP endpoints.
//
// Two roles consume this surface:
//   - admin: full surface, including users and overview/diagnostics.
//   - editor: station catalog only (stations CRUD, streams, probe, featured,
//     editorial review, status). Mounted under /editor in cmd/api/main.go.
//
// The station-management methods (AdminListStations, AdminCreateStation,
// AdminBulkAction, AdminGetStation, AdminUpdateStation,
// AdminProbeStationStream, AdminGetStationIcon) serve both surfaces; the role
// gate lives at the route group, not in the handler. The Admin* prefix is
// kept for now to avoid a wide rename — the dependency wiring (h.admin.*) is
// shared between the two surfaces.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/radio"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// AdminStats handles GET /admin/stats
func (h *Handler) AdminStats(c *gin.Context) {
	pending, err := h.admin.stations.CountByStatus(c.Request.Context(), "pending")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	approved, err := h.admin.stations.CountByStatus(c.Request.Context(), "approved")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	rejected, err := h.admin.stations.CountByStatus(c.Request.Context(), "rejected")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"pending":  pending,
		"approved": approved,
		"rejected": rejected,
		"total":    pending + approved + rejected,
	})
}

// AdminBulkAction handles POST /editor/stations/bulk
// Body: { "ids": ["uuid", ...], "status": "approved"|"rejected"|"pending" }
func (h *Handler) AdminBulkAction(c *gin.Context) {
	var req struct {
		IDs    []string `json:"ids"    binding:"required"`
		Status string   `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids and status are required"})
		return
	}
	switch req.Status {
	case "approved", "rejected", "pending":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be pending, approved, or rejected"})
		return
	}

	updated, err := h.admin.stations.BulkUpdateStatus(c.Request.Context(), req.IDs, req.Status)
	if err != nil {
		if errors.Is(err, store.ErrDuplicateStationName) {
			c.JSON(http.StatusConflict, gin.H{"error": "another approved station already uses this name"})
			return
		}
		h.log.Error("admin bulk action", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": updated, "status": req.Status})
}

// AdminListUsers handles GET /admin/users
func (h *Handler) AdminListUsers(c *gin.Context) {
	limit := queryInt(c, "limit", 50)
	offset := queryInt(c, "offset", 0)
	query := strings.TrimSpace(c.Query("q"))

	users, total, err := h.admin.users.ListUsers(c.Request.Context(), limit, offset, query)
	if err != nil {
		h.log.Error("admin list users", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	type userResp struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
		Role  string `json:"role"`
	}
	resp := make([]userResp, len(users))
	for i, u := range users {
		resp[i] = userResp{ID: u.ID, Email: u.Email, Name: u.Name, Role: string(u.Role)}
	}
	c.JSON(http.StatusOK, gin.H{"users": resp, "total": total})
}

// adminStationResponse extends the public response with editorial + status fields.
type adminStationResponse struct {
	stationResponse
	Status        string  `json:"status"`
	InternalNotes *string `json:"internal_notes,omitempty"`
}

// adminStationWithStreams fetches the stream variants for s and builds the
// full admin response.
func (h *Handler) adminStationWithStreams(ctx context.Context, s *store.Station) (adminStationResponse, error) {
	streamMap, err := h.attachStreamsToStations(ctx, []*store.Station{s})
	if err != nil {
		return adminStationResponse{}, err
	}
	return toAdminStationResponse(s, streamMap[s.ID]), nil
}

type adminStreamRequest struct {
	URL                    string          `json:"url"`
	Priority               int             `json:"priority"`
	IsActive               *bool           `json:"is_active"`
	Bitrate                *int            `json:"bitrate"`
	MetadataMode           *string         `json:"metadata_mode"`
	MetadataType           *string         `json:"metadata_type"`
	MetadataProvider       *string         `json:"metadata_provider"`
	MetadataProviderConfig json.RawMessage `json:"metadata_provider_config"`
}

func toAdminStationResponse(s *store.Station, streams []streamResponse) adminStationResponse {
	return adminStationResponse{
		stationResponse: toStationResponse(s, streams),
		Status:          s.Status,
		InternalNotes:   s.InternalNotes,
	}
}

func stationAllowsPersistedNowPlaying(station *store.Station) bool {
	return station != nil && strings.EqualFold(strings.TrimSpace(station.Status), "approved")
}

// AdminCreateStation handles POST /editor/stations.
// Creates a station manually from editorial input.
func (h *Handler) AdminCreateStation(c *gin.Context) {
	var req struct {
		Name            string               `json:"name" binding:"required"`
		Streams         []adminStreamRequest `json:"streams" binding:"required"`
		Homepage        string               `json:"homepage"`
		Logo            string               `json:"logo"`
		GenreTags       []string             `json:"genre_tags"`
		SubgenreTags    []string             `json:"subgenre_tags"`
		Language        string               `json:"language"`
		Country         string               `json:"country"`
		City            string               `json:"city"`
		StyleTags       []string             `json:"style_tags"`
		FormatTags      []string             `json:"format_tags"`
		TextureTags     []string             `json:"texture_tags"`
		Status          string               `json:"status"`
		Featured        bool                 `json:"featured"`
		Overview        *string              `json:"overview"`
		EditorialReview *string              `json:"editorial_review"`
		InternalNotes   *string              `json:"internal_notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and at least one stream are required"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	streams, err := h.buildStationStreams(req.Streams)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}

	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "pending"
	}
	switch status {
	case "approved", "rejected", "pending":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be pending, approved, or rejected"})
		return
	}

	manual := store.ManualStationInput{
		Name:            name,
		Homepage:        strings.TrimSpace(req.Homepage),
		Logo:            strings.TrimSpace(req.Logo),
		GenreTags:       req.GenreTags,
		SubgenreTags:    req.SubgenreTags,
		Language:        strings.TrimSpace(req.Language),
		Country:         strings.TrimSpace(req.Country),
		City:            strings.TrimSpace(req.City),
		StyleTags:       req.StyleTags,
		FormatTags:      req.FormatTags,
		TextureTags:     req.TextureTags,
		Status:          status,
		Featured:        req.Featured,
		Overview:        normalizeOptionalText(req.Overview),
		EditorialReview: normalizeOptionalText(req.EditorialReview),
		InternalNotes:   normalizeOptionalText(req.InternalNotes),
	}

	created, err := h.admin.stations.CreateManual(c.Request.Context(), manual)
	if err != nil {
		if errors.Is(err, store.ErrDuplicateStationName) {
			c.JSON(http.StatusConflict, gin.H{"error": "another approved station already uses this name"})
			return
		}
		h.log.Error("admin create station", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if _, err := h.admin.streams.ReplaceForStation(c.Request.Context(), created.ID, streams); err != nil {
		h.log.Error("admin create station streams", "station_id", created.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	created, err = h.admin.stations.GetByIDAdmin(c.Request.Context(), created.ID)
	if err != nil {
		h.log.Error("admin create station reload", "station_id", created.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp, err := h.adminStationWithStreams(c.Request.Context(), created)
	if err != nil {
		h.log.Error("admin create station streams", "station_id", created.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

// AdminProbeStationStream handles POST /editor/stations/:id/streams/:streamID/probe.
// Query param `scope` can be `quality`, `metadata`, `resolver`, `loudness`, or `full`.
func (h *Handler) AdminProbeStationStream(c *gin.Context) {
	startedAt := time.Now()
	stationID := strings.TrimSpace(c.Param("id"))
	streamID := strings.TrimSpace(c.Param("streamID"))
	if stationID == "" || streamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "station id and stream id are required"})
		return
	}

	station, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), stationID)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "station not found"})
		return
	}
	if err != nil {
		h.log.Error("admin probe stream load station", "station_id", stationID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	streams, err := h.admin.streams.ListByStationID(c.Request.Context(), stationID)
	if err != nil {
		h.log.Error("admin probe stream list streams", "station_id", stationID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	var target *store.StationStream
	for _, stream := range streams {
		if stream.ID == streamID {
			target = stream
			break
		}
	}
	if target == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "stream not found"})
		return
	}

	scope := strings.ToLower(strings.TrimSpace(c.Query("scope")))
	if scope == "" {
		scope = "full"
	}
	if scope != "full" && scope != "quality" && scope != "metadata" && scope != "resolver" && scope != "loudness" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scope must be quality, metadata, resolver, loudness, or full"})
		return
	}

	resolvedURL := strings.TrimSpace(target.ResolvedURL)
	resolvedKind := target.Kind
	resolvedContainer := target.Container
	var qualityUpdate *store.StreamQualityUpdate
	var loudnessUpdate *store.StreamLoudnessUpdate
	var metadataUpdate *store.StreamMetadataUpdate

	if scope == "full" || scope == "quality" || scope == "loudness" {
		probeCtx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
		probe := radio.ProbeStreamWithOptions(probeCtx, h.admin.streamProbeClient, target.URL, radio.StreamProbeOptions{
			IncludeLoudness: scope == "full" || scope == "loudness",
		})
		cancel()

		nextHealth := target.HealthScore
		if probe.LastError == nil {
			nextHealth = 1
		}
		nextProbeAt := radio.NextProbeAt(probe.LastCheckedAt, probe.LastErrorCode)

		qualityUpdate = &store.StreamQualityUpdate{
			ResolvedURL:          probe.ResolvedURL,
			Kind:                 probe.Kind,
			Container:            probe.Container,
			Transport:            probe.Transport,
			MimeType:             probe.MimeType,
			Codec:                probe.Codec,
			BitDepth:             probe.BitDepth,
			SampleRateHz:         probe.SampleRateHz,
			SampleRateConfidence: probe.SampleRateConfidence,
			Channels:             probe.Channels,
			HealthScore:          &nextHealth,
			NextProbeAt:          &nextProbeAt,
			LastCheckedAt:        probe.LastCheckedAt,
			LastError:            probe.LastError,
			LastErrorCode:        probe.LastErrorCode,
		}
		if scope == "full" || scope == "loudness" {
			loudnessUpdate = &store.StreamLoudnessUpdate{
				IntegratedLUFS: probe.LoudnessIntegratedLUFS,
				PeakDBFS:       probe.LoudnessPeakDBFS,
				SampleDuration: probe.LoudnessSampleDuration,
				MeasuredAt:     probe.LoudnessMeasuredAt,
				Status:         probe.LoudnessStatus,
			}
		}

		if strings.TrimSpace(probe.ResolvedURL) != "" {
			resolvedURL = strings.TrimSpace(probe.ResolvedURL)
		}
		if strings.TrimSpace(probe.Kind) != "" {
			resolvedKind = strings.TrimSpace(probe.Kind)
		}
		if strings.TrimSpace(probe.Container) != "" {
			resolvedContainer = strings.TrimSpace(probe.Container)
		}
	}

	if scope == "full" || scope == "metadata" || scope == "resolver" {
		metadataURL := resolvedURL
		if metadataURL == "" {
			metadataURL = target.URL
		}
		hintedMetadataURL := stringValue(target.MetadataURL)
		metadataEnabled := metadataModeEnabled(target.MetadataMode)
		routing := h.admin.metadataRouter.Classify(c.Request.Context(), radio.MetadataRouteInput{
			StreamURL:       metadataURL,
			MetadataURLHint: hintedMetadataURL,
			Kind:            resolvedKind,
			Container:       resolvedContainer,
			MetadataEnabled: metadataEnabled,
			MetadataType:    target.MetadataType,
		})
		nextMetadataDelayed := target.MetadataDelayed
		if scope == "full" || scope == "metadata" {
			np, ev := h.admin.metaFetcher.Probe(c.Request.Context(), metadataURL, metadata.Config{
				Enabled:        metadataEnabled,
				Type:           target.MetadataType,
				SourceHint:     stringValue(target.MetadataSource),
				MetadataURL:    stringValue(target.MetadataURL),
				DelayedICY:     target.MetadataDelayed,
				Provider:       stringValue(target.MetadataProvider),
				ProviderConfig: target.MetadataProviderConfig,
			})
			snap := store.StreamNowPlaying{
				StreamID:    target.ID,
				Title:       np.Title,
				Artist:      np.Artist,
				Song:        np.Song,
				Source:      np.Source,
				MetadataURL: optionalString(np.MetadataURL),
				Error:       optionalString(np.Error),
				ErrorCode:   optionalString(np.ErrorCode),
				FetchedAt:   np.FetchedAt,
			}
			if stationAllowsPersistedNowPlaying(station) {
				if err := h.admin.nowPlaying.Upsert(context.WithoutCancel(c.Request.Context()), snap); err != nil {
					h.log.Error("admin probe stream update metadata", "stream_id", target.ID, "scope", scope, "error", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
					return
				}
			}
			if np.ErrorCode == metadata.ErrorCodeNoMeta && routing.Resolver != metadata.ResolverClient {
				routing.Resolver = metadata.ResolverNone
				routing.MetadataURL = nil
			}
			if hinted := strings.TrimSpace(np.MetadataURL); hinted != "" && !strings.EqualFold(hinted, hintedMetadataURL) {
				hintedMetadataURL = hinted
				routing = h.admin.metadataRouter.Classify(c.Request.Context(), radio.MetadataRouteInput{
					StreamURL:       metadataURL,
					MetadataURLHint: hintedMetadataURL,
					Kind:            resolvedKind,
					Container:       resolvedContainer,
					MetadataEnabled: metadataEnabled,
					MetadataType:    target.MetadataType,
				})
			}
			nextMetadataDelayed = ev.DelayedICY || nextMetadataDelayed
			metadataURLValue := optionalString(np.MetadataURL)
			if metadataURLValue == nil {
				metadataURLValue = routing.MetadataURL
			}
			metadataUpdate = &store.StreamMetadataUpdate{
				Source:            optionalString(np.Source),
				URL:               metadataURLValue,
				Delayed:           &nextMetadataDelayed,
				IncludeResolver:   true,
				Resolver:          routing.Resolver,
				ResolverCheckedAt: &routing.CheckedAt,
			}
		} else {
			metadataUpdate = &store.StreamMetadataUpdate{
				URL:               routing.MetadataURL,
				Delayed:           &nextMetadataDelayed,
				IncludeResolver:   true,
				Resolver:          routing.Resolver,
				ResolverCheckedAt: &routing.CheckedAt,
			}
		}
	}

	if qualityUpdate != nil || loudnessUpdate != nil || metadataUpdate != nil {
		if err := h.admin.streams.ApplyDiagnosticsUpdate(context.WithoutCancel(c.Request.Context()), target.ID, store.StreamDiagnosticsUpdate{
			Quality:  qualityUpdate,
			Loudness: loudnessUpdate,
			Metadata: metadataUpdate,
		}); err != nil {
			h.log.Error("admin probe stream apply diagnostics", "stream_id", target.ID, "scope", scope, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	}

	reloaded, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), stationID)
	if err != nil {
		h.log.Error("admin probe stream reload station", "station_id", stationID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp, err := h.adminStationWithStreams(c.Request.Context(), reloaded)
	if err != nil {
		h.log.Error("admin probe stream reload streams", "station_id", stationID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	h.log.Info("admin stream probe completed", append(requestLogAttrs(c.Request.Context()),
		"event", "stream_probe_completed",
		"station_id", stationID,
		"stream_id", streamID,
		"probe_scope", scope,
		"duration_ms", time.Since(startedAt).Milliseconds(),
	)...)
	c.JSON(http.StatusOK, resp)
}

// AdminListStations handles GET /editor/stations?status=pending|approved|rejected
func (h *Handler) AdminListStations(c *gin.Context) {
	status := c.DefaultQuery("status", "pending")
	f := store.StationFilter{
		Status: status,
		Search: strings.TrimSpace(c.Query("q")),
		Limit:  queryInt(c, "limit", 50),
		Offset: queryInt(c, "offset", 0),
	}

	total, err := h.admin.stations.Count(c.Request.Context(), f)
	if err != nil {
		h.log.Error("admin count stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stations, err := h.admin.stations.List(c.Request.Context(), f)
	if err != nil {
		h.log.Error("admin list stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	streamMap, err := h.attachStreamsToStations(c.Request.Context(), stations)
	if err != nil {
		h.log.Error("admin list station streams", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp := make([]adminStationResponse, len(stations))
	for i, s := range stations {
		resp[i] = toAdminStationResponse(s, streamMap[s.ID])
	}
	c.JSON(http.StatusOK, gin.H{"stations": resp, "count": total})
}

// AdminGetStation handles GET /editor/stations/:id
func (h *Handler) AdminGetStation(c *gin.Context) {
	s, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		h.log.Error("admin get station", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp, err := h.adminStationWithStreams(c.Request.Context(), s)
	if err != nil {
		h.log.Error("admin get station streams", "station_id", s.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// AdminGetStationIcon handles GET /editor/stations/:id/icon
func (h *Handler) AdminGetStationIcon(c *gin.Context) {
	stationID := c.Param("id")

	if _, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), stationID); errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	} else if err != nil {
		h.log.Error("admin get station icon station", "station_id", stationID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	asset, err := h.admin.media.GetLatestByOwnerAndKind(
		c.Request.Context(),
		store.MediaAssetOwnerStation,
		stationID,
		store.MediaAssetKindStationIcon,
	)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "station icon not found"})
		return
	}
	if err != nil {
		h.log.Error("admin get station icon", "station_id", stationID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, h.mediaResponse(asset))
}

// AdminUpdateStation handles PUT /editor/stations/:id.
// Accepts editable original station fields + moderation/editorial fields.
func (h *Handler) AdminUpdateStation(c *gin.Context) {
	id := c.Param("id")

	// Load current values so omitted fields keep their existing value.
	current, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		h.log.Error("admin update station fetch", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	currentStreams, err := h.admin.streams.ListByStationID(c.Request.Context(), id)
	if err != nil {
		h.log.Error("admin update station fetch streams", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	var req struct {
		Name            *string               `json:"name"`
		Streams         *[]adminStreamRequest `json:"streams"`
		Website         *string               `json:"website"`
		Logo            *string               `json:"logo"`
		GenreTags       *[]string             `json:"genre_tags"`
		SubgenreTags    *[]string             `json:"subgenre_tags"`
		Language        *string               `json:"language"`
		Country         *string               `json:"country"`
		City            *string               `json:"city"`
		StyleTags       *[]string             `json:"style_tags"`
		FormatTags      *[]string             `json:"format_tags"`
		TextureTags     *[]string             `json:"texture_tags"`
		Status          *string               `json:"status"`
		Overview        *string               `json:"overview"`
		EditorialReview *string               `json:"editorial_review"`
		InternalNotes   *string               `json:"internal_notes"`
		Featured        *bool                 `json:"featured"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Merge: use incoming value if provided, else keep current.
	u := store.EnrichmentUpdate{
		Name:            current.Name,
		Homepage:        current.Homepage,
		Logo:            current.Logo,
		GenreTags:       current.GenreTags,
		SubgenreTags:    current.SubgenreTags,
		Language:        current.Language,
		Country:         current.Country,
		City:            current.City,
		StyleTags:       current.StyleTags,
		FormatTags:      current.FormatTags,
		TextureTags:     current.TextureTags,
		Status:          current.Status,
		EditorialReview: current.EditorialReview,
		InternalNotes:   current.InternalNotes,
		Featured:        current.Featured,
	}
	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
			return
		}
		u.Name = trimmed
	}
	if req.Website != nil {
		u.Homepage = strings.TrimSpace(*req.Website)
	}
	if req.Logo != nil {
		u.Logo = strings.TrimSpace(*req.Logo)
	}
	if req.GenreTags != nil {
		u.GenreTags = *req.GenreTags
	}
	if req.SubgenreTags != nil {
		u.SubgenreTags = *req.SubgenreTags
	}
	if req.Language != nil {
		u.Language = strings.TrimSpace(*req.Language)
	}
	if req.Country != nil {
		u.Country = strings.TrimSpace(*req.Country)
	}
	if req.City != nil {
		u.City = strings.TrimSpace(*req.City)
	}
	if req.StyleTags != nil {
		u.StyleTags = *req.StyleTags
	}
	if req.FormatTags != nil {
		u.FormatTags = *req.FormatTags
	}
	if req.TextureTags != nil {
		u.TextureTags = *req.TextureTags
	}
	u.Overview = current.Overview
	if req.Status != nil {
		switch *req.Status {
		case "approved", "rejected", "pending":
			u.Status = *req.Status
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "status must be pending, approved, or rejected"})
			return
		}
	}
	if req.Overview != nil {
		u.Overview = normalizeOptionalText(req.Overview)
	}
	if req.EditorialReview != nil {
		u.EditorialReview = normalizeOptionalText(req.EditorialReview)
	}
	if req.InternalNotes != nil {
		u.InternalNotes = normalizeOptionalText(req.InternalNotes)
	}
	if req.Featured != nil {
		u.Featured = *req.Featured
	}

	// Rebuild stream variants when the caller provides an explicit list.
	// When only streams changed, upsert the primary without probing.
	var rebuiltStreams []store.StationStreamInput

	if req.Streams != nil && len(*req.Streams) > 0 {
		inputs, err := h.buildStationStreams(*req.Streams)
		if err != nil {
			h.log.Error("admin update station streams probe", "error", err)
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
			return
		}
		mergeExistingProbeData(inputs, currentStreams)
		rebuiltStreams = inputs
	}

	if len(rebuiltStreams) > 0 {
		if err := h.admin.stations.UpdateEnrichmentAndStreams(c.Request.Context(), id, u, rebuiltStreams); err != nil {
			if errors.Is(err, store.ErrDuplicateStationName) {
				c.JSON(http.StatusConflict, gin.H{"error": "another approved station already uses this name"})
				return
			}
			h.log.Error("admin update station+streams", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	} else {
		if err := h.admin.stations.UpdateEnrichment(c.Request.Context(), id, u); err != nil {
			if errors.Is(err, store.ErrDuplicateStationName) {
				c.JSON(http.StatusConflict, gin.H{"error": "another approved station already uses this name"})
				return
			}
			h.log.Error("admin update station", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	}

	updated, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), id)
	if err != nil {
		h.log.Error("admin update station reload", "station_id", id, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	resp, err := h.adminStationWithStreams(c.Request.Context(), updated)
	if err != nil {
		h.log.Error("admin update station streams", "station_id", id, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func normalizeOptionalText(raw *string) *string {
	if raw == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeMetadataType(raw string) string {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "", "auto":
		return "auto"
	case "icy", "icecast", "shoutcast":
		return v
	default:
		return ""
	}
}

func normalizeMetadataMode(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "auto":
		return "auto"
	case "off":
		return "off"
	default:
		return ""
	}
}

func stringPtr(value string) *string {
	return &value
}

func normalizeAdminStreams(raw []adminStreamRequest) []adminStreamRequest {
	streams := make([]adminStreamRequest, 0, len(raw))
	for _, stream := range raw {
		if strings.TrimSpace(stream.URL) == "" {
			continue
		}
		streams = append(streams, adminStreamRequest{
			URL:                    strings.TrimSpace(stream.URL),
			Priority:               stream.Priority,
			IsActive:               stream.IsActive,
			Bitrate:                stream.Bitrate,
			MetadataMode:           stringPtr(normalizeMetadataMode(stringValue(stream.MetadataMode))),
			MetadataType:           stream.MetadataType,
			MetadataProvider:       stream.MetadataProvider,
			MetadataProviderConfig: stream.MetadataProviderConfig,
		})
	}

	sort.SliceStable(streams, func(i, j int) bool {
		pi := streams[i].Priority
		pj := streams[j].Priority
		if pi <= 0 {
			pi = i + 1
		}
		if pj <= 0 {
			pj = j + 1
		}
		if pi == pj {
			return i < j
		}
		return pi < pj
	})
	return streams
}

func (h *Handler) buildStationStreams(raw []adminStreamRequest) ([]store.StationStreamInput, error) {
	streams := normalizeAdminStreams(raw)
	if len(streams) == 0 {
		return nil, errors.New("at least one stream is required")
	}

	seenURLs := make(map[string]int, len(streams))
	seenPriorities := make(map[int]int, len(streams))

	inputs := make([]store.StationStreamInput, 0, len(streams))
	for i, stream := range streams {
		priority := stream.Priority
		if priority <= 0 {
			priority = i + 1
		}
		if prev, ok := seenPriorities[priority]; ok {
			return nil, fmt.Errorf("stream %d duplicates priority %d already used by stream %d", i+1, priority, prev)
		}
		seenPriorities[priority] = i + 1

		normalizedURL := strings.ToLower(strings.TrimSpace(stream.URL))
		if prev, ok := seenURLs[normalizedURL]; ok {
			return nil, fmt.Errorf("stream %d duplicates URL already used by stream %d", i+1, prev)
		}
		seenURLs[normalizedURL] = i + 1
		if stream.Bitrate != nil && *stream.Bitrate < 0 {
			return nil, fmt.Errorf("stream %d bitrate must be >= 0", i+1)
		}

		probe := radio.LightClassifyStreamURL(stream.URL)
		probe.Bitrate = resolveStreamBitrate(stream.Bitrate, stream.URL, probe)

		isActive := true
		if stream.IsActive != nil {
			isActive = *stream.IsActive
		}
		metadataMode := "auto"
		if stream.MetadataMode != nil {
			metadataMode = normalizeMetadataMode(*stream.MetadataMode)
			if metadataMode == "" {
				return nil, fmt.Errorf("stream %d metadata mode is invalid", i+1)
			}
		}
		metadataType := "auto"
		if stream.MetadataType != nil {
			metadataType = normalizeMetadataType(*stream.MetadataType)
			if metadataType == "" {
				return nil, fmt.Errorf("stream %d metadata type is invalid", i+1)
			}
		}
		metadataProvider, metadataProviderConfig, err := normalizeAdminMetadataProviderConfig(stream.MetadataProvider, stream.MetadataProviderConfig)
		if err != nil {
			return nil, fmt.Errorf("stream %d %w", i+1, err)
		}

		inputs = append(inputs, store.StationStreamInput{
			URL:                    strings.TrimSpace(stream.URL),
			ResolvedURL:            probe.ResolvedURL,
			Kind:                   probe.Kind,
			Container:              probe.Container,
			Transport:              probe.Transport,
			MimeType:               probe.MimeType,
			Codec:                  probe.Codec,
			Bitrate:                probe.Bitrate,
			BitDepth:               probe.BitDepth,
			SampleRateHz:           probe.SampleRateHz,
			SampleRateConfidence:   probe.SampleRateConfidence,
			Channels:               probe.Channels,
			Priority:               priority,
			IsActive:               isActive,
			LoudnessIntegratedLUFS: probe.LoudnessIntegratedLUFS,
			LoudnessPeakDBFS:       probe.LoudnessPeakDBFS,
			LoudnessSampleDuration: probe.LoudnessSampleDuration,
			LoudnessMeasuredAt:     probe.LoudnessMeasuredAt,
			LoudnessStatus:         probe.LoudnessStatus,
			MetadataMode:           metadataMode,
			MetadataType:           metadataType,
			MetadataProvider:       metadataProvider,
			MetadataProviderConfig: metadataProviderConfig,
			HealthScore:            0,
		})
	}
	return inputs, nil
}

func normalizeAdminMetadataProviderConfig(rawProvider *string, rawConfig json.RawMessage) (*string, []byte, error) {
	if rawProvider == nil || strings.TrimSpace(*rawProvider) == "" {
		return nil, nil, nil
	}
	provider := strings.ToLower(strings.TrimSpace(*rawProvider))
	switch provider {
	case metadata.ProviderNPRComposer:
		ucs, err := parseNPRComposerUCS(rawConfig)
		if err != nil {
			return nil, nil, err
		}
		canonical, err := json.Marshal(map[string]string{"ucs": ucs})
		if err != nil {
			return nil, nil, err
		}
		return &provider, canonical, nil
	case metadata.ProviderNTSLive:
		channel, err := parseNTSLiveChannel(rawConfig)
		if err != nil {
			return nil, nil, err
		}
		canonical, err := json.Marshal(map[string]string{"channel": channel})
		if err != nil {
			return nil, nil, err
		}
		return &provider, canonical, nil
	default:
		return nil, nil, fmt.Errorf("metadata provider %q is invalid", provider)
	}
}

func parseNPRComposerUCS(raw json.RawMessage) (string, error) {
	var cfg struct {
		UCS string `json:"ucs"`
		URL string `json:"url"`
	}
	if len(raw) == 0 {
		return "", errors.New("npr composer provider config is required")
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return "", fmt.Errorf("npr composer provider config must be JSON: %w", err)
	}
	if ucs := strings.TrimSpace(cfg.UCS); ucs != "" {
		return ucs, nil
	}
	parsed, err := url.Parse(strings.TrimSpace(cfg.URL))
	if err != nil || parsed.Host != "api.composer.nprstations.org" {
		return "", errors.New("npr composer provider config requires ucs or an api.composer.nprstations.org playlist URL")
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) >= 4 && parts[0] == "v1" && parts[1] == "widget" && parts[3] == "playlist" && strings.TrimSpace(parts[2]) != "" {
		return parts[2], nil
	}
	return "", errors.New("npr composer playlist URL must include /v1/widget/{ucs}/playlist")
}

func parseNTSLiveChannel(raw json.RawMessage) (string, error) {
	var cfg struct {
		Channel string `json:"channel"`
	}
	if len(raw) == 0 {
		return "", errors.New("nts live provider config is required")
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return "", fmt.Errorf("nts live provider config must be JSON: %w", err)
	}
	channel := strings.TrimSpace(cfg.Channel)
	if channel != "1" && channel != "2" {
		return "", errors.New("nts live provider channel must be 1 or 2")
	}
	return channel, nil
}

// mergeExistingProbeData copies probe-measured fields from existing DB streams
// into freshly-built inputs for any stream whose URL matches, so that a save
// does not erase loudness, codec, metadata resolver, health score, etc.
// Editorial fields (priority, active, metadata enabled/type, bitrate) are kept
// from the new input.
func mergeExistingProbeData(inputs []store.StationStreamInput, existing []*store.StationStream) {
	byURL := make(map[string]*store.StationStream, len(existing))
	for _, s := range existing {
		byURL[strings.ToLower(strings.TrimSpace(s.URL))] = s
	}
	for i := range inputs {
		cur, ok := byURL[strings.ToLower(strings.TrimSpace(inputs[i].URL))]
		if !ok {
			continue
		}
		in := &inputs[i]
		in.ResolvedURL = cur.ResolvedURL
		in.Kind = cur.Kind
		in.Container = cur.Container
		in.Transport = cur.Transport
		in.MimeType = cur.MimeType
		in.Codec = cur.Codec
		in.BitDepth = cur.BitDepth
		in.SampleRateHz = cur.SampleRateHz
		in.SampleRateConfidence = cur.SampleRateConfidence
		in.Channels = cur.Channels
		in.LoudnessIntegratedLUFS = cur.LoudnessIntegratedLUFS
		in.LoudnessPeakDBFS = cur.LoudnessPeakDBFS
		in.LoudnessSampleDuration = cur.LoudnessSampleDuration
		in.LoudnessMeasuredAt = cur.LoudnessMeasuredAt
		in.LoudnessStatus = cur.LoudnessStatus
		in.MetadataSource = cur.MetadataSource
		in.MetadataURL = cur.MetadataURL
		in.MetadataResolver = cur.MetadataResolver
		in.MetadataResolverCheckedAt = cur.MetadataResolverCheckedAt
		if in.MetadataProvider == nil {
			in.MetadataProvider = cur.MetadataProvider
		}
		if len(in.MetadataProviderConfig) == 0 {
			in.MetadataProviderConfig = cur.MetadataProviderConfig
		}
		in.HealthScore = cur.HealthScore
		in.NextProbeAt = &cur.NextProbeAt
		in.LastCheckedAt = cur.LastCheckedAt
		in.LastError = cur.LastError
		in.LastErrorCode = cur.LastErrorCode
		if cur.Bitrate > 0 && in.Bitrate == 0 {
			in.Bitrate = cur.Bitrate
		}
	}
}

func resolveStreamBitrate(override *int, rawURL string, probe radio.StreamProbeResult) int {
	if isLosslessStreamVariant(rawURL, probe) {
		// Lossless streams are variable/non-kbps-coded in practice; avoid
		// inheriting misleading URL tokens like ".../320.flac".
		if override != nil && *override > 0 {
			return *override
		}
		return 0
	}
	if override != nil && *override > 0 {
		return *override
	}
	if inferred := inferBitrateFromURL(rawURL); inferred > 0 {
		return inferred
	}
	if inferred := inferBitrateFromURL(probe.ResolvedURL); inferred > 0 {
		return inferred
	}
	if probe.Bitrate > 0 {
		return probe.Bitrate
	}
	return 0
}

func isLosslessStreamVariant(rawURL string, probe radio.StreamProbeResult) bool {
	containsFLAC := func(v string) bool {
		return strings.Contains(strings.ToLower(strings.TrimSpace(v)), "flac")
	}
	return containsFLAC(rawURL) ||
		containsFLAC(probe.ResolvedURL) ||
		containsFLAC(probe.Codec) ||
		containsFLAC(probe.MimeType)
}

var knownBitrateToken = regexp.MustCompile(`(?i)(^|[^0-9])(32|48|56|64|80|96|112|128|160|192|224|256|320|384|512)([^0-9]|$)`)

func inferBitrateFromURL(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	u, err := url.Parse(raw)
	if err != nil {
		return 0
	}

	search := strings.ToLower(u.Path)
	if u.RawQuery != "" {
		search += "&" + strings.ToLower(u.RawQuery)
	}

	matches := knownBitrateToken.FindAllStringSubmatch(search, -1)
	if len(matches) == 0 {
		return 0
	}

	// Use the last known bitrate-like token in the URL, which typically maps to
	// stream variant suffixes like /stream/256.mp3.
	for i := len(matches) - 1; i >= 0; i-- {
		v, err := strconv.Atoi(matches[i][2])
		if err == nil && v > 0 {
			return v
		}
	}
	return 0
}

// AdminSetUserRole handles PUT /admin/users/:id/role
// Body: { "role": "user" | "editor" | "admin" }
func (h *Handler) AdminSetUserRole(c *gin.Context) {
	userID := c.Param("id")

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	role, err := store.ParseRole(req.Role)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be one of: user, editor, admin"})
		return
	}

	if err := h.admin.users.SetRole(c.Request.Context(), userID, role); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		h.log.Error("admin set user role", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user_id": userID, "role": string(role)})
}
