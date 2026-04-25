package handler

import (
	"context"
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

// AdminBulkAction handles POST /admin/stations/bulk
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

	users, total, err := h.admin.users.ListUsers(c.Request.Context(), limit, offset)
	if err != nil {
		h.log.Error("admin list users", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	type userResp struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		IsAdmin bool   `json:"is_admin"`
	}
	resp := make([]userResp, len(users))
	for i, u := range users {
		resp[i] = userResp{ID: u.ID, Email: u.Email, Name: u.Name, IsAdmin: u.IsAdmin}
	}
	c.JSON(http.StatusOK, gin.H{"users": resp, "total": total})
}

// adminStationResponse extends the public response with editorial + status fields.
type adminStationResponse struct {
	stationResponse
	Status string `json:"status"`
}

// adminStationWithStreams fetches the stream variants for s and builds the
// full admin response. Falls back to the station's legacy stream_url on error.
func (h *Handler) adminStationWithStreams(ctx context.Context, s *store.Station) adminStationResponse {
	streamMap, err := h.attachStreamsToStations(ctx, []*store.Station{s})
	if err != nil {
		return toAdminStationResponse(s, defaultStreamResponseForStation(s))
	}
	return toAdminStationResponse(s, streamMap[s.ID])
}

type adminStreamRequest struct {
	URL             string  `json:"url"`
	Priority        int     `json:"priority"`
	IsActive        *bool   `json:"is_active"`
	Bitrate         *int    `json:"bitrate"`
	MetadataEnabled *bool   `json:"metadata_enabled"`
	MetadataType    *string `json:"metadata_type"`
}

func toAdminStationResponse(s *store.Station, streams []streamResponse) adminStationResponse {
	return adminStationResponse{
		stationResponse: toStationResponse(s, streams),
		Status:          s.Status,
	}
}

// AdminCreateStation handles POST /admin/stations.
// Creates a station manually from admin input.
func (h *Handler) AdminCreateStation(c *gin.Context) {
	var req struct {
		Name        string   `json:"name" binding:"required"`
		StreamURL   string   `json:"stream_url" binding:"required"`
		Homepage    string   `json:"homepage"`
		Logo        string   `json:"logo"`
		Genres      []string `json:"genres"`
		Language    string   `json:"language"`
		Country     string   `json:"country"`
		City        string   `json:"city"`
		Tags        []string `json:"tags"`
		StyleTags   []string `json:"style_tags"`
		FormatTags  []string `json:"format_tags"`
		TextureTags []string `json:"texture_tags"`
		Status      string   `json:"status"`
		Featured    bool     `json:"featured"`
		Overview    *string  `json:"overview"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and stream_url are required"})
		return
	}

	name := strings.TrimSpace(req.Name)
	streamURL := strings.TrimSpace(req.StreamURL)
	if name == "" || streamURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and stream_url are required"})
		return
	}
	parsed, err := url.ParseRequestURI(streamURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "stream_url must be a valid absolute URL"})
		return
	}

	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "approved"
	}
	switch status {
	case "approved", "rejected", "pending":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be pending, approved, or rejected"})
		return
	}

	manual := store.ManualStationInput{
		Name:        name,
		StreamURL:   streamURL,
		Homepage:    strings.TrimSpace(req.Homepage),
		Logo:        strings.TrimSpace(req.Logo),
		Genres:      req.Genres,
		Language:    strings.TrimSpace(req.Language),
		Country:     strings.TrimSpace(req.Country),
		City:        strings.TrimSpace(req.City),
		Tags:        req.Tags,
		StyleTags:   req.StyleTags,
		FormatTags:  req.FormatTags,
		TextureTags: req.TextureTags,
		Status:      status,
		Featured:    req.Featured,
		Overview:    normalizeOptionalText(req.Overview),
	}

	probe := radio.LightClassifyStreamURL(streamURL)
	probe.Bitrate = resolveStreamBitrate(nil, streamURL, probe)

	created, err := h.admin.stations.CreateManual(c.Request.Context(), manual)
	if err != nil {
		h.log.Error("admin create station", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	_ = h.admin.streams.UpsertPrimaryForStation(c.Request.Context(), created.ID, store.StationStreamInput{
		URL:                    streamURL,
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
		Priority:               1,
		IsActive:               true,
		LoudnessIntegratedLUFS: probe.LoudnessIntegratedLUFS,
		LoudnessPeakDBFS:       probe.LoudnessPeakDBFS,
		LoudnessSampleDuration: probe.LoudnessSampleDuration,
		LoudnessMeasuredAt:     probe.LoudnessMeasuredAt,
		LoudnessStatus:         probe.LoudnessStatus,
		MetadataEnabled:        true,
		MetadataType:           "auto",
		HealthScore:            0,
	})

	created, err = h.admin.stations.GetByIDAdmin(c.Request.Context(), created.ID)
	if err != nil {
		h.log.Error("admin create station reload", "station_id", created.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusCreated, h.adminStationWithStreams(c.Request.Context(), created))
}

// AdminProbeStationStream handles POST /admin/stations/:id/streams/:streamID/probe.
// Query param `scope` can be `quality`, `metadata`, `resolver`, `loudness`, or `full`.
func (h *Handler) AdminProbeStationStream(c *gin.Context) {
	stationID := strings.TrimSpace(c.Param("id"))
	streamID := strings.TrimSpace(c.Param("streamID"))
	if stationID == "" || streamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "station id and stream id are required"})
		return
	}

	_, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), stationID)
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

		update := store.ProbeUpdate{
			ResolvedURL:          probe.ResolvedURL,
			Kind:                 probe.Kind,
			Container:            probe.Container,
			Transport:            probe.Transport,
			MimeType:             probe.MimeType,
			Codec:                probe.Codec,
			Bitrate:              probe.Bitrate,
			BitDepth:             probe.BitDepth,
			SampleRateHz:         probe.SampleRateHz,
			SampleRateConfidence: probe.SampleRateConfidence,
			Channels:             probe.Channels,
			HealthScore:          &nextHealth,
			LastCheckedAt:        probe.LastCheckedAt,
			LastError:            probe.LastError,
		}
		if scope == "full" || scope == "loudness" {
			update.IncludeLoudness = true
			update.LoudnessIntegratedLUFS = probe.LoudnessIntegratedLUFS
			update.LoudnessPeakDBFS = probe.LoudnessPeakDBFS
			update.LoudnessSampleDuration = probe.LoudnessSampleDuration
			update.LoudnessMeasuredAt = probe.LoudnessMeasuredAt
			update.LoudnessStatus = probe.LoudnessStatus
		}

		if err := h.admin.streams.UpdateProbeResult(context.WithoutCancel(c.Request.Context()), target.ID, update); err != nil {
			h.log.Error("admin probe stream update probe", "stream_id", target.ID, "scope", scope, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
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
		if scope == "metadata" || scope == "resolver" {
			classified := radio.LightClassifyStreamURL(metadataURL)
			if v := strings.TrimSpace(classified.Kind); v != "" {
				resolvedKind = v
			}
			if v := strings.TrimSpace(classified.Container); v != "" {
				resolvedContainer = v
			}
		}
		clientMetadata := radio.ProbeClientMetadataSupport(
			c.Request.Context(),
			h.admin.streamProbeClient,
			h.admin.browserProbeOrigins,
			metadataURL,
			resolvedKind,
			resolvedContainer,
			target.MetadataEnabled,
			target.MetadataType,
		)
		hlsID3Supported := false
		if target.MetadataEnabled && strings.EqualFold(resolvedKind, "hls") {
			hlsID3Supported = radio.ProbeHLSID3Support(c.Request.Context(), h.admin.streamProbeClient, metadataURL)
		}
		nextResolver := radio.ResolveMetadataResolver(target.MetadataEnabled, clientMetadata.Supported)
		if strings.EqualFold(resolvedKind, "hls") {
			if hlsID3Supported {
				nextResolver = "client"
			} else {
				nextResolver = "none"
			}
		}
		nextMetadataURL := optionalString(clientMetadata.MetadataURL)
		if strings.EqualFold(nextResolver, "client") && nextMetadataURL == nil && strings.EqualFold(resolvedKind, "hls") {
			nextMetadataURL = optionalString(metadataURL)
		}
		if scope == "full" || scope == "metadata" {
			np := h.admin.metaFetcher.Fetch(c.Request.Context(), metadataURL, metadata.Config{
				Enabled:     target.MetadataEnabled,
				Type:        target.MetadataType,
				SourceHint:  stringValue(target.MetadataSource),
				MetadataURL: stringValue(target.MetadataURL),
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
			if err := h.admin.nowPlaying.Upsert(context.WithoutCancel(c.Request.Context()), snap); err != nil {
				h.log.Error("admin probe stream update metadata", "stream_id", target.ID, "scope", scope, "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
				return
			}
			// Persist discovered source / URL hints back to the editorial row.
			if np.Source != "" || np.MetadataURL != "" {
				src := optionalString(np.Source)
				url := optionalString(np.MetadataURL)
				_ = h.admin.streams.UpdateMetadataDetection(context.WithoutCancel(c.Request.Context()), target.ID, src, url)
			}
		}
		if err := h.admin.streams.UpdateMetadataResolver(context.WithoutCancel(c.Request.Context()), target.ID, store.MetadataResolverSnapshot{
			Resolver:    nextResolver,
			MetadataURL: nextMetadataURL,
			CheckedAt:   &clientMetadata.CheckedAt,
		}); err != nil {
			h.log.Error("admin probe stream update metadata resolver", "stream_id", target.ID, "scope", scope, "error", err)
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

	c.JSON(http.StatusOK, h.adminStationWithStreams(c.Request.Context(), reloaded))
}

// AdminListStations handles GET /admin/stations?status=pending|approved|rejected
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

// AdminGetStation handles GET /admin/stations/:id
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
	c.JSON(http.StatusOK, h.adminStationWithStreams(c.Request.Context(), s))
}

// AdminGetStationIcon handles GET /admin/stations/:id/icon
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

// AdminUpdateStation handles PUT /admin/stations/:id.
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
		Name        *string               `json:"name"`
		StreamURL   *string               `json:"stream_url"`
		Streams     *[]adminStreamRequest `json:"streams"`
		Website     *string               `json:"website"`
		Logo        *string               `json:"logo"`
		Genres      *[]string             `json:"genres"`
		Language    *string               `json:"language"`
		Country     *string               `json:"country"`
		City        *string               `json:"city"`
		Tags        *[]string             `json:"tags"`
		StyleTags   *[]string             `json:"style_tags"`
		FormatTags  *[]string             `json:"format_tags"`
		TextureTags *[]string             `json:"texture_tags"`
		Status      *string               `json:"status"`
		Overview    *string               `json:"overview"`
		EditorNotes *string               `json:"editor_notes"`
		Featured    *bool                 `json:"featured"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Merge: use incoming value if provided, else keep current.
	u := store.EnrichmentUpdate{
		Name:        current.Name,
		StreamURL:   current.StreamURL,
		Homepage:    current.Homepage,
		Logo:        current.Logo,
		Genres:      current.Genres,
		Language:    current.Language,
		Country:     current.Country,
		City:        current.City,
		Tags:        current.Tags,
		StyleTags:   current.StyleTags,
		FormatTags:  current.FormatTags,
		TextureTags: current.TextureTags,
		Status:      current.Status,
		EditorNotes: current.EditorNotes,
		Featured:    current.Featured,
	}
	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
			return
		}
		u.Name = trimmed
	}
	if req.StreamURL != nil {
		trimmed := strings.TrimSpace(*req.StreamURL)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "stream_url cannot be empty"})
			return
		}
		parsed, err := url.ParseRequestURI(trimmed)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "stream_url must be a valid absolute URL"})
			return
		}
		u.StreamURL = trimmed
	}
	if req.Website != nil {
		u.Homepage = strings.TrimSpace(*req.Website)
	}
	if req.Logo != nil {
		u.Logo = strings.TrimSpace(*req.Logo)
	}
	if req.Genres != nil {
		u.Genres = *req.Genres
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
	if req.Tags != nil {
		u.Tags = *req.Tags
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
	if req.EditorNotes != nil {
		u.EditorNotes = req.EditorNotes
	}
	if req.Featured != nil {
		u.Featured = *req.Featured
	}

	// Rebuild stream variants when the caller provides an explicit list.
	// When only stream_url changed (no list), upsert the primary without probing.
	var (
		rebuiltStreams []store.StationStreamInput
		primaryInput   *store.StationStreamInput
	)

	if req.Streams != nil && len(*req.Streams) > 0 {
		inputs, err := h.buildStationStreams(c, *req.Streams, u.StreamURL)
		if err != nil {
			h.log.Error("admin update station streams probe", "error", err)
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
			return
		}
		mergeExistingProbeData(inputs, currentStreams)
		rebuiltStreams = inputs
	} else if req.StreamURL != nil {
		classified := radio.LightClassifyStreamURL(u.StreamURL)
		classified.Bitrate = resolveStreamBitrate(nil, u.StreamURL, classified)
		metadataEnabled := true
		for _, stream := range currentStreams {
			if stream.Priority != 1 {
				continue
			}
			metadataEnabled = stream.MetadataEnabled
			break
		}
		in := store.StationStreamInput{
			URL:                  u.StreamURL,
			ResolvedURL:          classified.ResolvedURL,
			Kind:                 classified.Kind,
			Container:            classified.Container,
			Transport:            classified.Transport,
			MimeType:             classified.MimeType,
			Codec:                classified.Codec,
			Bitrate:              classified.Bitrate,
			BitDepth:             classified.BitDepth,
			SampleRateHz:         classified.SampleRateHz,
			SampleRateConfidence: classified.SampleRateConfidence,
			Channels:             classified.Channels,
			Priority:             1,
			IsActive:             true,
			MetadataEnabled:      metadataEnabled,
			MetadataType:         metadata.TypeAuto,
		}
		mergeExistingProbeData([]store.StationStreamInput{in}, currentStreams)
		primaryInput = &in
	}

	if len(rebuiltStreams) > 0 {
		if err := h.admin.stations.UpdateEnrichmentAndStreams(c.Request.Context(), id, u, rebuiltStreams); err != nil {
			h.log.Error("admin update station+streams", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	} else {
		if err := h.admin.stations.UpdateEnrichment(c.Request.Context(), id, u); err != nil {
			h.log.Error("admin update station", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	}

	if primaryInput != nil {
		_ = h.admin.streams.UpsertPrimaryForStation(c.Request.Context(), id, *primaryInput)
	}

	updated, err := h.admin.stations.GetByIDAdmin(c.Request.Context(), id)
	if err != nil {
		h.log.Error("admin update station reload", "station_id", id, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, h.adminStationWithStreams(c.Request.Context(), updated))
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

func normalizeAdminStreams(raw []adminStreamRequest, fallbackURL string) []adminStreamRequest {
	streams := make([]adminStreamRequest, 0, len(raw)+1)
	for _, stream := range raw {
		if strings.TrimSpace(stream.URL) == "" {
			continue
		}
		streams = append(streams, adminStreamRequest{
			URL:             strings.TrimSpace(stream.URL),
			Priority:        stream.Priority,
			IsActive:        stream.IsActive,
			Bitrate:         stream.Bitrate,
			MetadataEnabled: stream.MetadataEnabled,
			MetadataType:    stream.MetadataType,
		})
	}
	if len(streams) == 0 && strings.TrimSpace(fallbackURL) != "" {
		active := true
		streams = append(streams, adminStreamRequest{
			URL:             strings.TrimSpace(fallbackURL),
			Priority:        1,
			IsActive:        &active,
			MetadataEnabled: &active,
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

func (h *Handler) buildStationStreams(
	ctx *gin.Context,
	raw []adminStreamRequest,
	fallbackURL string,
) ([]store.StationStreamInput, error) {
	streams := normalizeAdminStreams(raw, fallbackURL)
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
		metadataEnabled := true
		if stream.MetadataEnabled != nil {
			metadataEnabled = *stream.MetadataEnabled
		}
		metadataType := "auto"

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
			MetadataEnabled:        metadataEnabled,
			MetadataType:           metadataType,
			HealthScore:            0,
		})
	}
	return inputs, nil
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
		in.HealthScore = cur.HealthScore
		in.LastCheckedAt = cur.LastCheckedAt
		in.LastError = cur.LastError
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

// AdminSetUserAdmin handles PUT /admin/users/:id/admin
// Body: { "is_admin": true|false }
func (h *Handler) AdminSetUserAdmin(c *gin.Context) {
	userID := c.Param("id")

	var req struct {
		IsAdmin bool `json:"is_admin"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.admin.users.SetAdmin(c.Request.Context(), userID, req.IsAdmin); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		h.log.Error("admin set user admin", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user_id": userID, "is_admin": req.IsAdmin})
}
