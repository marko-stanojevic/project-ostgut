package handler

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// stationResponse is the public API shape for a station.
type stationResponse struct {
	ID               string           `json:"id"`
	Name             string           `json:"name"`
	Logo             string           `json:"logo,omitempty"`
	Website          string           `json:"website,omitempty"`
	Overview         *string          `json:"overview,omitempty"`
	Description      *string          `json:"description,omitempty"`
	EditorialReview  *string          `json:"editorial_review,omitempty"`
	GenreTags        []string         `json:"genre_tags"`
	SubgenreTags     []string         `json:"subgenre_tags"`
	Language         string           `json:"language"`
	Country          string           `json:"country"`
	City             string           `json:"city"`
	SearchTags       []string         `json:"search_tags"`
	StyleTags        []string         `json:"style_tags"`
	FormatTags       []string         `json:"format_tags"`
	TextureTags      []string         `json:"texture_tags"`
	ReliabilityScore float64          `json:"reliability_score"`
	Featured         bool             `json:"featured"`
	Streams          []streamResponse `json:"streams"`
}

type streamResponse struct {
	ID                        string   `json:"id"`
	URL                       string   `json:"url"`
	ResolvedURL               string   `json:"resolved_url"`
	Kind                      string   `json:"kind"`
	Container                 string   `json:"container"`
	Transport                 string   `json:"transport"`
	MimeType                  string   `json:"mime_type"`
	Codec                     string   `json:"codec"`
	Lossless                  bool     `json:"lossless"`
	Bitrate                   int      `json:"bitrate"`
	BitDepth                  int      `json:"bit_depth"`
	SampleRateHz              int      `json:"sample_rate_hz"`
	SampleRateConfidence      string   `json:"sample_rate_confidence"`
	Channels                  int      `json:"channels"`
	Priority                  int      `json:"priority"`
	IsActive                  bool     `json:"is_active"`
	LoudnessIntegratedLUFS    *float64 `json:"loudness_integrated_lufs,omitempty"`
	LoudnessPeakDBFS          *float64 `json:"loudness_peak_dbfs,omitempty"`
	LoudnessSampleDuration    float64  `json:"loudness_sample_duration_seconds"`
	LoudnessMeasuredAt        *string  `json:"loudness_measured_at,omitempty"`
	LoudnessStatus            string   `json:"loudness_measurement_status"`
	MetadataEnabled           bool     `json:"metadata_enabled"`
	MetadataType              string   `json:"metadata_type"`
	MetadataSource            *string  `json:"metadata_source,omitempty"`
	MetadataURL               *string  `json:"metadata_url,omitempty"`
	MetadataResolver          string   `json:"metadata_resolver,omitempty"`
	MetadataResolverCheckedAt *string  `json:"metadata_resolver_checked_at,omitempty"`
	MetadataDelayed           bool     `json:"metadata_delayed"`
	HealthScore               float64  `json:"health_score"`
	LastCheckedAt             *string  `json:"last_checked_at,omitempty"`
	LastError                 *string  `json:"last_error,omitempty"`
}

func toStreamResponse(s *store.StationStream) streamResponse {
	var lastCheckedAt *string
	if s.LastCheckedAt != nil {
		formatted := s.LastCheckedAt.UTC().Format(time.RFC3339)
		lastCheckedAt = &formatted
	}
	var metadataResolverCheckedAt *string
	if s.MetadataResolverCheckedAt != nil {
		formatted := s.MetadataResolverCheckedAt.UTC().Format(time.RFC3339)
		metadataResolverCheckedAt = &formatted
	}
	var loudnessMeasuredAt *string
	if s.LoudnessMeasuredAt != nil {
		formatted := s.LoudnessMeasuredAt.UTC().Format(time.RFC3339)
		loudnessMeasuredAt = &formatted
	}
	return streamResponse{
		ID:                        s.ID,
		URL:                       s.URL,
		ResolvedURL:               s.ResolvedURL,
		Kind:                      s.Kind,
		Container:                 s.Container,
		Transport:                 s.Transport,
		MimeType:                  s.MimeType,
		Codec:                     s.Codec,
		Lossless:                  isLosslessStream(s.Codec, s.MimeType, s.URL, s.ResolvedURL),
		Bitrate:                   s.Bitrate,
		BitDepth:                  s.BitDepth,
		SampleRateHz:              s.SampleRateHz,
		SampleRateConfidence:      s.SampleRateConfidence,
		Channels:                  s.Channels,
		Priority:                  s.Priority,
		IsActive:                  s.IsActive,
		LoudnessIntegratedLUFS:    s.LoudnessIntegratedLUFS,
		LoudnessPeakDBFS:          s.LoudnessPeakDBFS,
		LoudnessSampleDuration:    s.LoudnessSampleDuration,
		LoudnessMeasuredAt:        loudnessMeasuredAt,
		LoudnessStatus:            s.LoudnessStatus,
		MetadataEnabled:           s.MetadataEnabled,
		MetadataType:              s.MetadataType,
		MetadataSource:            s.MetadataSource,
		MetadataURL:               s.MetadataURL,
		MetadataResolver:          metadataResolverForResponse(s),
		MetadataResolverCheckedAt: metadataResolverCheckedAt,
		MetadataDelayed:           s.MetadataDelayed,
		HealthScore:               s.HealthScore,
		LastCheckedAt:             lastCheckedAt,
		LastError:                 s.LastError,
	}
}

var publicStationListQueryParams = map[string]struct{}{
	"country":     {},
	"featured":    {},
	"format":      {},
	"genre":       {},
	"language":    {},
	"limit":       {},
	"min_bitrate": {},
	"offset":      {},
	"q":           {},
	"sort":        {},
	"style":       {},
	"subgenre":    {},
	"texture":     {},
}

var publicStationSearchQueryParams = map[string]struct{}{
	"limit":  {},
	"offset": {},
	"q":      {},
}

func metadataResolverForResponse(s *store.StationStream) string {
	if s == nil || !s.MetadataEnabled {
		return "none"
	}
	switch strings.ToLower(strings.TrimSpace(s.MetadataResolver)) {
	case "client":
		return "client"
	case "none":
		return "none"
	default:
		return "server"
	}
}

func isLosslessStream(codec, mimeType, urlValue, resolvedURL string) bool {
	if strings.Contains(strings.ToLower(strings.TrimSpace(codec)), "flac") {
		return true
	}
	if strings.Contains(strings.ToLower(strings.TrimSpace(mimeType)), "flac") {
		return true
	}
	if strings.Contains(strings.ToLower(strings.TrimSpace(urlValue)), "flac") {
		return true
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(resolvedURL)), "flac")
}

func toStationResponse(s *store.Station, streams []streamResponse) stationResponse {
	normSlice := func(in []string) []string {
		if in == nil {
			return []string{}
		}
		return in
	}
	genreTags := normSlice(s.GenreTags)
	subgenreTags := normSlice(s.SubgenreTags)
	searchTags := normSlice(s.SearchTags)
	styleTags := normSlice(s.StyleTags)
	formatTags := normSlice(s.FormatTags)
	textureTags := normSlice(s.TextureTags)

	return stationResponse{
		ID:               s.ID,
		Name:             s.Name,
		Logo:             s.Logo,
		Website:          s.Homepage,
		Overview:         s.Overview,
		Description:      s.Overview,
		EditorialReview:  s.EditorialReview,
		GenreTags:        genreTags,
		SubgenreTags:     subgenreTags,
		Language:         s.Language,
		Country:          s.Country,
		City:             s.City,
		SearchTags:       searchTags,
		StyleTags:        styleTags,
		FormatTags:       formatTags,
		TextureTags:      textureTags,
		ReliabilityScore: s.ReliabilityScore,
		Featured:         s.Featured,
		Streams:          streams,
	}
}

func (h *Handler) attachStreamsToStations(ctx context.Context, stations []*store.Station) (map[string][]streamResponse, error) {
	ids := make([]string, 0, len(stations))
	for _, st := range stations {
		ids = append(ids, st.ID)
	}
	rawMap, err := h.station.streams.ListByStationIDs(ctx, ids)
	if err != nil {
		return nil, err
	}

	result := make(map[string][]streamResponse, len(stations))
	for _, st := range stations {
		raw := rawMap[st.ID]
		if len(raw) == 0 {
			result[st.ID] = []streamResponse{}
			continue
		}

		streams := make([]streamResponse, 0, len(raw))
		for _, stream := range raw {
			streams = append(streams, toStreamResponse(stream))
		}
		result[st.ID] = streams
	}
	return result, nil
}

// ListStations handles GET /stations
// Query params: q, genre, country, language, min_bitrate, style, format, texture, featured, sort, limit, offset
func (h *Handler) ListStations(c *gin.Context) {
	if h.rejectUnknownPublicQueryParams(c, publicStationListQueryParams) {
		return
	}

	f := store.StationFilter{
		Search:       strings.TrimSpace(c.Query("q")),
		Genres:       lowerAll(c.QueryArray("genre")),
		Subgenres:    lowerAll(c.QueryArray("subgenre")),
		Country:      strings.ToLower(strings.TrimSpace(c.Query("country"))),
		Language:     strings.ToLower(c.Query("language")),
		MinBitrate:   queryInt(c, "min_bitrate", 0),
		Styles:       lowerAll(c.QueryArray("style")),
		Formats:      lowerAll(c.QueryArray("format")),
		Textures:     lowerAll(c.QueryArray("texture")),
		Sort:         c.Query("sort"),
		FeaturedOnly: c.Query("featured") == "true",
		Limit:        queryInt(c, "limit", 50),
		Offset:       queryInt(c, "offset", 0),
	}
	if f.Limit > 100 {
		f.Limit = 100
	}

	total, err := h.station.stations.Count(c.Request.Context(), f)
	if err != nil {
		h.log.Error("count stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stations, err := h.station.stations.List(c.Request.Context(), f)
	if err != nil {
		h.log.Error("list stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	streamMap, err := h.attachStreamsToStations(c.Request.Context(), stations)
	if err != nil {
		h.log.Error("list station streams", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp := make([]stationResponse, len(stations))
	for i, s := range stations {
		resp[i] = toStationResponse(s, streamMap[s.ID])
	}
	c.JSON(http.StatusOK, gin.H{"stations": resp, "total": total})
}

// GetStation handles GET /stations/:id
func (h *Handler) GetStation(c *gin.Context) {
	id := c.Param("id")
	station, err := h.station.stations.GetByID(c.Request.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "station not found"})
		return
	}
	if err != nil {
		h.log.Error("get station", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	streamMap, err := h.attachStreamsToStations(c.Request.Context(), []*store.Station{station})
	if err != nil {
		h.log.Error("get station streams", "station_id", station.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, toStationResponse(station, streamMap[station.ID]))
}

// SearchStations handles GET /search?q=
func (h *Handler) SearchStations(c *gin.Context) {
	if h.rejectUnknownPublicQueryParams(c, publicStationSearchQueryParams) {
		return
	}

	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q is required"})
		return
	}

	f := store.StationFilter{
		Search: q,
		Limit:  queryInt(c, "limit", 20),
		Offset: queryInt(c, "offset", 0),
	}

	total, err := h.station.stations.Count(c.Request.Context(), f)
	if err != nil {
		h.log.Error("count search stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stations, err := h.station.stations.List(c.Request.Context(), f)
	if err != nil {
		h.log.Error("search stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	streamMap, err := h.attachStreamsToStations(c.Request.Context(), stations)
	if err != nil {
		h.log.Error("search station streams", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp := make([]stationResponse, len(stations))
	for i, s := range stations {
		resp[i] = toStationResponse(s, streamMap[s.ID])
	}
	c.JSON(http.StatusOK, gin.H{"stations": resp, "total": total})
}

// GetFilters handles GET /stations/filters — returns available genres, styles, formats, and textures.
func (h *Handler) GetFilters(c *gin.Context) {
	ctx := c.Request.Context()

	genreTags, err := h.station.stations.GenreTags(ctx)
	if err != nil {
		h.log.Error("get genres", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	subgenreTags, err := h.station.stations.SubgenreTags(ctx)
	if err != nil {
		h.log.Error("get subgenres", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	styles, err := h.station.stations.Styles(ctx)
	if err != nil {
		h.log.Error("get styles", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	formats, err := h.station.stations.Formats(ctx)
	if err != nil {
		h.log.Error("get formats", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	textures, err := h.station.stations.Textures(ctx)
	if err != nil {
		h.log.Error("get textures", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if genreTags == nil {
		genreTags = []string{}
	}
	if subgenreTags == nil {
		subgenreTags = []string{}
	}
	if styles == nil {
		styles = []string{}
	}
	if formats == nil {
		formats = []string{}
	}
	if textures == nil {
		textures = []string{}
	}
	c.JSON(http.StatusOK, gin.H{
		"genre_tags":    genreTags,
		"subgenre_tags": subgenreTags,
		"style_tags":    styles,
		"format_tags":   formats,
		"texture_tags":  textures,
	})
}

func lowerAll(ss []string) []string {
	out := ss[:0:len(ss)]
	for _, s := range ss {
		if v := strings.ToLower(strings.TrimSpace(s)); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func queryInt(c *gin.Context, key string, def int) int {
	if v := c.Query(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

func (h *Handler) rejectUnknownPublicQueryParams(c *gin.Context, allowed map[string]struct{}) bool {
	if !h.enforcePublicQueryAllowlist {
		return false
	}

	unknown := unknownQueryParams(c.Request.URL.Query(), allowed)
	if len(unknown) == 0 {
		return false
	}

	if len(unknown) == 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown query parameter: " + unknown[0]})
		return true
	}

	c.JSON(http.StatusBadRequest, gin.H{"error": "unknown query parameters: " + strings.Join(unknown, ", ")})
	return true
}

func unknownQueryParams(values url.Values, allowed map[string]struct{}) []string {
	unknown := make([]string, 0)
	for key := range values {
		if _, ok := allowed[key]; ok {
			continue
		}
		unknown = append(unknown, key)
	}
	sort.Strings(unknown)
	return unknown
}
