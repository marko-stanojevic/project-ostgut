package handler

import (
	"context"
	"errors"
	"net/http"
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
	StreamURL        string           `json:"stream_url"`
	Logo             string           `json:"logo,omitempty"`
	Website          string           `json:"website,omitempty"`
	Overview         *string          `json:"overview,omitempty"`
	Description      *string          `json:"description,omitempty"`
	EditorNotes      *string          `json:"editor_notes,omitempty"`
	Genres           []string         `json:"genres"`
	Language         string           `json:"language"`
	Country          string           `json:"country"`
	City             string           `json:"city"`
	CountryCode      string           `json:"country_code"`
	Tags             []string         `json:"tags"`
	StyleTags        []string         `json:"style_tags"`
	FormatTags       []string         `json:"format_tags"`
	TextureTags      []string         `json:"texture_tags"`
	ReliabilityScore float64          `json:"reliability_score"`
	Featured         bool             `json:"featured"`
	Streams          []streamResponse `json:"streams"`
}

type streamResponse struct {
	ID                   string  `json:"id"`
	URL                  string  `json:"url"`
	ResolvedURL          string  `json:"resolved_url"`
	Kind                 string  `json:"kind"`
	Container            string  `json:"container"`
	Transport            string  `json:"transport"`
	MimeType             string  `json:"mime_type"`
	Codec                string  `json:"codec"`
	Lossless             bool    `json:"lossless"`
	Bitrate              int     `json:"bitrate"`
	BitDepth             int     `json:"bit_depth"`
	SampleRateHz         int     `json:"sample_rate_hz"`
	SampleRateConfidence string  `json:"sample_rate_confidence"`
	Channels             int     `json:"channels"`
	Priority             int     `json:"priority"`
	IsActive             bool    `json:"is_active"`
	HealthScore          float64 `json:"health_score"`
	LastCheckedAt        *string `json:"last_checked_at,omitempty"`
	LastError            *string `json:"last_error,omitempty"`
}

func toStreamResponse(s *store.StationStream) streamResponse {
	var lastCheckedAt *string
	if s.LastCheckedAt != nil {
		formatted := s.LastCheckedAt.UTC().Format(time.RFC3339)
		lastCheckedAt = &formatted
	}
	return streamResponse{
		ID:                   s.ID,
		URL:                  s.URL,
		ResolvedURL:          s.ResolvedURL,
		Kind:                 s.Kind,
		Container:            s.Container,
		Transport:            s.Transport,
		MimeType:             s.MimeType,
		Codec:                s.Codec,
		Lossless:             isLosslessStream(s.Codec, s.MimeType, s.URL, s.ResolvedURL),
		Bitrate:              s.Bitrate,
		BitDepth:             s.BitDepth,
		SampleRateHz:         s.SampleRateHz,
		SampleRateConfidence: s.SampleRateConfidence,
		Channels:             s.Channels,
		Priority:             s.Priority,
		IsActive:             s.IsActive,
		HealthScore:          s.HealthScore,
		LastCheckedAt:        lastCheckedAt,
		LastError:            s.LastError,
	}
}

func defaultStreamResponseForStation(s *store.Station) []streamResponse {
	if strings.TrimSpace(s.StreamURL) == "" {
		return []streamResponse{}
	}
	transport := "http"
	if strings.HasPrefix(strings.ToLower(s.StreamURL), "https://") {
		transport = "https"
	}

	return []streamResponse{{
		URL:                  s.StreamURL,
		ResolvedURL:          s.StreamURL,
		Kind:                 "direct",
		Container:            "none",
		Transport:            transport,
		Lossless:             isLosslessStream("", "", s.StreamURL, s.StreamURL),
		BitDepth:             0,
		SampleRateHz:         0,
		SampleRateConfidence: "unknown",
		Channels:             0,
		Priority:             1,
		IsActive:             true,
		HealthScore:          s.ReliabilityScore,
	}}
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
	styleTags := normSlice(s.StyleTags)
	formatTags := normSlice(s.FormatTags)
	textureTags := normSlice(s.TextureTags)

	// genres: normalised lowercase, empty strings dropped
	genres := make([]string, 0, len(s.Genres))
	for _, g := range s.Genres {
		if v := strings.ToLower(strings.TrimSpace(g)); v != "" {
			genres = append(genres, v)
		}
	}

	// tags = genres + editorial tag categories, deduped
	seen := make(map[string]struct{}, len(genres)+len(styleTags)+len(formatTags)+len(textureTags))
	combined := make([]string, 0, len(genres)+len(styleTags)+len(formatTags)+len(textureTags))
	addTag := func(v string) {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" {
			return
		}
		if _, ok := seen[v]; !ok {
			seen[v] = struct{}{}
			combined = append(combined, v)
		}
	}
	for _, g := range genres {
		addTag(g)
	}
	for _, t := range styleTags {
		addTag(t)
	}
	for _, t := range formatTags {
		addTag(t)
	}
	for _, t := range textureTags {
		addTag(t)
	}

	return stationResponse{
		ID:               s.ID,
		Name:             s.Name,
		StreamURL:        s.StreamURL,
		Logo:             s.Logo,
		Website:          s.Homepage,
		Overview:         s.Overview,
		Description:      s.Overview,
		EditorNotes:      s.EditorNotes,
		Genres:           genres,
		Language:         s.Language,
		Country:          s.Country,
		City:             s.City,
		CountryCode:      s.CountryCode,
		Tags:             combined,
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
	rawMap, err := h.stationStreamStore.ListByStationIDs(ctx, ids)
	if err != nil {
		return nil, err
	}

	result := make(map[string][]streamResponse, len(stations))
	for _, st := range stations {
		raw := rawMap[st.ID]
		if len(raw) == 0 {
			result[st.ID] = defaultStreamResponseForStation(st)
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
	f := store.StationFilter{
		Search:       strings.TrimSpace(c.Query("q")),
		Genre:        strings.ToLower(c.Query("genre")),
		CountryCode:  strings.ToUpper(c.Query("country")),
		Language:     strings.ToLower(c.Query("language")),
		MinBitrate:   queryInt(c, "min_bitrate", 0),
		Style:        strings.ToLower(c.Query("style")),
		Format:       strings.ToLower(c.Query("format")),
		Texture:      strings.ToLower(c.Query("texture")),
		Sort:         c.Query("sort"),
		FeaturedOnly: c.Query("featured") == "true",
		Limit:        queryInt(c, "limit", 50),
		Offset:       queryInt(c, "offset", 0),
	}
	if f.Limit > 100 {
		f.Limit = 100
	}

	total, err := h.stationStore.Count(c.Request.Context(), f)
	if err != nil {
		h.log.Error("count stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stations, err := h.stationStore.List(c.Request.Context(), f)
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
	station, err := h.stationStore.GetByID(c.Request.Context(), id)
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

	total, err := h.stationStore.Count(c.Request.Context(), f)
	if err != nil {
		h.log.Error("count search stations", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	stations, err := h.stationStore.List(c.Request.Context(), f)
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

	genres, err := h.stationStore.Genres(ctx)
	if err != nil {
		h.log.Error("get genres", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	styles, err := h.stationStore.Styles(ctx)
	if err != nil {
		h.log.Error("get styles", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	formats, err := h.stationStore.Formats(ctx)
	if err != nil {
		h.log.Error("get formats", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	textures, err := h.stationStore.Textures(ctx)
	if err != nil {
		h.log.Error("get textures", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if genres == nil {
		genres = []string{}
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
		"genres":   genres,
		"styles":   styles,
		"formats":  formats,
		"textures": textures,
	})
}

func queryInt(c *gin.Context, key string, def int) int {
	if v := c.Query(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}
