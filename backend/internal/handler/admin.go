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
	"github.com/marko-stanojevic/project-ostgut/backend/internal/radio"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// AdminStats handles GET /admin/stats
func (h *Handler) AdminStats(c *gin.Context) {
	pending, err := h.stationStore.CountByStatus(c.Request.Context(), "pending")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	approved, err := h.stationStore.CountByStatus(c.Request.Context(), "approved")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	rejected, err := h.stationStore.CountByStatus(c.Request.Context(), "rejected")
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

	updated, err := h.stationStore.BulkUpdateStatus(c.Request.Context(), req.IDs, req.Status)
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

	users, total, err := h.store.ListUsers(c.Request.Context(), limit, offset)
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
	Status                string  `json:"status"`
	MetadataEnabled       bool    `json:"metadata_enabled"`
	MetadataType          string  `json:"metadata_type"`
	MetadataError         *string `json:"metadata_error,omitempty"`
	MetadataErrorCode     *string `json:"metadata_error_code,omitempty"`
	MetadataLastFetchedAt *string `json:"metadata_last_fetched_at,omitempty"`
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
	URL      string `json:"url"`
	Priority int    `json:"priority"`
	IsActive *bool  `json:"is_active"`
	Bitrate  *int   `json:"bitrate"`
}

func toAdminStationResponse(s *store.Station, streams []streamResponse) adminStationResponse {
	var metadataLastFetchedAt *string
	if s.MetadataLastFetchedAt != nil {
		formatted := s.MetadataLastFetchedAt.UTC().Format(time.RFC3339)
		metadataLastFetchedAt = &formatted
	}

	return adminStationResponse{
		stationResponse:       toStationResponse(s, streams),
		Status:                s.Status,
		MetadataEnabled:       s.MetadataEnabled,
		MetadataType:          s.MetadataType,
		MetadataError:         s.MetadataError,
		MetadataErrorCode:     s.MetadataErrorCode,
		MetadataLastFetchedAt: metadataLastFetchedAt,
	}
}

// AdminCreateStation handles POST /admin/stations.
// Creates a station manually from admin input.
func (h *Handler) AdminCreateStation(c *gin.Context) {
	var req struct {
		Name             string   `json:"name" binding:"required"`
		StreamURL        string   `json:"stream_url" binding:"required"`
		Homepage         string   `json:"homepage"`
		Logo             string   `json:"logo"`
		Genres           []string `json:"genres"`
		Language         string   `json:"language"`
		Country          string   `json:"country"`
		City             string   `json:"city"`
		CountryCode      string   `json:"country_code"`
		Tags             []string `json:"tags"`
		StyleTags        []string `json:"style_tags"`
		FormatTags       []string `json:"format_tags"`
		TextureTags      []string `json:"texture_tags"`
		ReliabilityScore float64  `json:"reliability_score"`
		Status           string   `json:"status"`
		Featured         bool     `json:"featured"`
		Overview         *string  `json:"overview"`
		MetadataEnabled  *bool    `json:"metadata_enabled"`
		MetadataType     *string  `json:"metadata_type"`
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

	reliability := req.ReliabilityScore
	if reliability == 0 {
		reliability = 0.8
	}
	if reliability < 0 || reliability > 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reliability_score must be between 0 and 1"})
		return
	}

	metadataEnabled := true
	if req.MetadataEnabled != nil {
		metadataEnabled = *req.MetadataEnabled
	}

	metadataType := "auto"
	if req.MetadataType != nil {
		metadataType = normalizeMetadataType(*req.MetadataType)
	} else {
		metadataType = normalizeMetadataType(metadataType)
	}
	if metadataType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "metadata_type must be one of auto, icy, icecast, shoutcast"})
		return
	}

	manual := store.ManualStationInput{
		Name:             name,
		StreamURL:        streamURL,
		Homepage:         strings.TrimSpace(req.Homepage),
		Logo:             strings.TrimSpace(req.Logo),
		Genres:           req.Genres,
		Language:         strings.TrimSpace(req.Language),
		Country:          strings.TrimSpace(req.Country),
		City:             strings.TrimSpace(req.City),
		CountryCode:      strings.ToUpper(strings.TrimSpace(req.CountryCode)),
		Tags:             req.Tags,
		StyleTags:        req.StyleTags,
		FormatTags:       req.FormatTags,
		TextureTags:      req.TextureTags,
		ReliabilityScore: reliability,
		Status:           status,
		Featured:         req.Featured,
		Overview:         normalizeOptionalText(req.Overview),
		MetadataEnabled:  metadataEnabled,
		MetadataType:     metadataType,
	}

	probeCtx, probeCancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	probe := radio.ProbeStream(probeCtx, h.streamProbeClient, streamURL)
	probeCancel()
	if err := validateProbedStream(probe); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	probe.Bitrate = resolveStreamBitrate(nil, streamURL, probe)

	created, err := h.stationStore.CreateManual(c.Request.Context(), manual)
	if err != nil {
		h.log.Error("admin create station", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	_ = h.stationStreamStore.UpsertPrimaryForStation(c.Request.Context(), created.ID, store.StationStreamInput{
		URL:           streamURL,
		ResolvedURL:   probe.ResolvedURL,
		Kind:          probe.Kind,
		Container:     probe.Container,
		Transport:     probe.Transport,
		MimeType:      probe.MimeType,
		Codec:         probe.Codec,
		Bitrate:       probe.Bitrate,
		BitDepth:      probe.BitDepth,
		SampleRateHz:  probe.SampleRateHz,
		Channels:      probe.Channels,
		Priority:      1,
		IsActive:      true,
		HealthScore:   reliability,
		LastCheckedAt: &probe.LastCheckedAt,
		LastError:     probe.LastError,
	})

	c.JSON(http.StatusCreated, h.adminStationWithStreams(c.Request.Context(), created))
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

	total, err := h.stationStore.Count(c.Request.Context(), f)
	if err != nil {
		h.log.Error("admin count stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stations, err := h.stationStore.List(c.Request.Context(), f)
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
	s, err := h.stationStore.GetByIDAdmin(c.Request.Context(), c.Param("id"))
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

	if _, err := h.stationStore.GetByIDAdmin(c.Request.Context(), stationID); errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	} else if err != nil {
		h.log.Error("admin get station icon station", "station_id", stationID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	asset, err := h.mediaAssetStore.GetLatestByOwnerAndKind(
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
	current, err := h.stationStore.GetByIDAdmin(c.Request.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		h.log.Error("admin update station fetch", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	var req struct {
		Name             *string               `json:"name"`
		StreamURL        *string               `json:"stream_url"`
		Streams          *[]adminStreamRequest `json:"streams"`
		Website          *string               `json:"website"`
		Logo             *string               `json:"logo"`
		Genres           *[]string             `json:"genres"`
		Language         *string               `json:"language"`
		Country          *string               `json:"country"`
		City             *string               `json:"city"`
		CountryCode      *string               `json:"country_code"`
		Tags             *[]string             `json:"tags"`
		StyleTags        *[]string             `json:"style_tags"`
		FormatTags       *[]string             `json:"format_tags"`
		TextureTags      *[]string             `json:"texture_tags"`
		ReliabilityScore *float64              `json:"reliability_score"`
		Status           *string               `json:"status"`
		MetadataEnabled  *bool                 `json:"metadata_enabled"`
		MetadataType     *string               `json:"metadata_type"`
		Overview         *string               `json:"overview"`
		EditorNotes      *string               `json:"editor_notes"`
		Featured         *bool                 `json:"featured"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Merge: use incoming value if provided, else keep current.
	u := store.EnrichmentUpdate{
		Name:             current.Name,
		StreamURL:        current.StreamURL,
		Homepage:         current.Homepage,
		Logo:             current.Logo,
		Genres:           current.Genres,
		Language:         current.Language,
		Country:          current.Country,
		City:             current.City,
		CountryCode:      current.CountryCode,
		Tags:             current.Tags,
		StyleTags:        current.StyleTags,
		FormatTags:       current.FormatTags,
		TextureTags:      current.TextureTags,
		ReliabilityScore: current.ReliabilityScore,
		Status:           current.Status,
		MetadataEnabled:  current.MetadataEnabled,
		MetadataType:     current.MetadataType,
		EditorNotes:      current.EditorNotes,
		Featured:         current.Featured,
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
	if req.CountryCode != nil {
		u.CountryCode = strings.ToUpper(strings.TrimSpace(*req.CountryCode))
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
	if req.ReliabilityScore != nil {
		if *req.ReliabilityScore < 0 || *req.ReliabilityScore > 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "reliability_score must be between 0 and 1"})
			return
		}
		u.ReliabilityScore = *req.ReliabilityScore
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
	if req.MetadataEnabled != nil {
		u.MetadataEnabled = *req.MetadataEnabled
	}
	if req.MetadataType != nil {
		normalized := normalizeMetadataType(*req.MetadataType)
		if normalized == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "metadata_type must be one of auto, icy, icecast, shoutcast"})
			return
		}
		u.MetadataType = normalized
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
	// When only stream_url changed (no list), re-probe and upsert the primary.
	var (
		rebuiltStreams []store.StationStreamInput
		primaryProbe   *radio.StreamProbeResult
	)

	if req.Streams != nil && len(*req.Streams) > 0 {
		inputs, err := h.buildStationStreams(c, *req.Streams, u.StreamURL, u.ReliabilityScore)
		if err != nil {
			h.log.Error("admin update station streams probe", "error", err)
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
			return
		}
		rebuiltStreams = inputs
	} else if req.StreamURL != nil {
		probeCtx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		probe := radio.ProbeStream(probeCtx, h.streamProbeClient, u.StreamURL)
		cancel()
		if err := validateProbedStream(probe); err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
			return
		}
		probe.Bitrate = resolveStreamBitrate(nil, u.StreamURL, probe)
		primaryProbe = &probe
	}

	if len(rebuiltStreams) > 0 {
		if err := h.stationStore.UpdateEnrichmentAndStreams(c.Request.Context(), id, u, rebuiltStreams); err != nil {
			h.log.Error("admin update station+streams", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	} else {
		if err := h.stationStore.UpdateEnrichment(c.Request.Context(), id, u); err != nil {
			h.log.Error("admin update station", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	}

	if primaryProbe != nil {
		_ = h.stationStreamStore.UpsertPrimaryForStation(c.Request.Context(), id, store.StationStreamInput{
			URL:           u.StreamURL,
			ResolvedURL:   primaryProbe.ResolvedURL,
			Kind:          primaryProbe.Kind,
			Container:     primaryProbe.Container,
			Transport:     primaryProbe.Transport,
			MimeType:      primaryProbe.MimeType,
			Codec:         primaryProbe.Codec,
			Bitrate:       primaryProbe.Bitrate,
			BitDepth:      primaryProbe.BitDepth,
			SampleRateHz:  primaryProbe.SampleRateHz,
			Channels:      primaryProbe.Channels,
			Priority:      1,
			IsActive:      true,
			HealthScore:   u.ReliabilityScore,
			LastCheckedAt: &primaryProbe.LastCheckedAt,
			LastError:     primaryProbe.LastError,
		})
	}

	updated, _ := h.stationStore.GetByIDAdmin(c.Request.Context(), id)
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
			URL:      strings.TrimSpace(stream.URL),
			Priority: stream.Priority,
			IsActive: stream.IsActive,
			Bitrate:  stream.Bitrate,
		})
	}
	if len(streams) == 0 && strings.TrimSpace(fallbackURL) != "" {
		active := true
		streams = append(streams, adminStreamRequest{
			URL:      strings.TrimSpace(fallbackURL),
			Priority: 1,
			IsActive: &active,
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
	fallbackReliability float64,
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

		probeCtx, cancel := context.WithTimeout(ctx.Request.Context(), 12*time.Second)
		probe := radio.ProbeStream(probeCtx, h.streamProbeClient, stream.URL)
		cancel()
		if err := validateProbedStream(probe); err != nil {
			return nil, fmt.Errorf("stream %d: %w", i+1, err)
		}
		probe.Bitrate = resolveStreamBitrate(stream.Bitrate, stream.URL, probe)

		isActive := true
		if stream.IsActive != nil {
			isActive = *stream.IsActive
		}

		health := 0.8
		if fallbackReliability > 0 {
			health = fallbackReliability
		}

		inputs = append(inputs, store.StationStreamInput{
			URL:           strings.TrimSpace(stream.URL),
			ResolvedURL:   probe.ResolvedURL,
			Kind:          probe.Kind,
			Container:     probe.Container,
			Transport:     probe.Transport,
			MimeType:      probe.MimeType,
			Codec:         probe.Codec,
			Bitrate:       probe.Bitrate,
			BitDepth:      probe.BitDepth,
			SampleRateHz:  probe.SampleRateHz,
			Channels:      probe.Channels,
			Priority:      priority,
			IsActive:      isActive,
			HealthScore:   health,
			LastCheckedAt: &probe.LastCheckedAt,
			LastError:     probe.LastError,
		})
	}
	return inputs, nil
}

func validateProbedStream(probe radio.StreamProbeResult) error {
	if probe.LastError != nil && strings.TrimSpace(*probe.LastError) != "" {
		return fmt.Errorf("stream probe failed: %s", strings.TrimSpace(*probe.LastError))
	}
	if strings.TrimSpace(probe.ResolvedURL) == "" {
		return errors.New("stream probe failed: empty resolved URL")
	}
	return nil
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

	if err := h.store.SetAdmin(c.Request.Context(), userID, req.IsAdmin); err != nil {
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
