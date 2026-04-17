package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// stationResponse is the public API shape for a station.
type stationResponse struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	StreamURL        string   `json:"stream_url"`
	Logo             string   `json:"logo,omitempty"`
	Website          string   `json:"website,omitempty"`
	Overview         *string  `json:"overview,omitempty"`
	Description      *string  `json:"description,omitempty"`
	EditorNotes      *string  `json:"editor_notes,omitempty"`
	Genre            string   `json:"genre"`
	Language         string   `json:"language"`
	Country          string   `json:"country"`
	City             string   `json:"city"`
	CountryCode      string   `json:"country_code"`
	Tags             []string `json:"tags"`
	Bitrate          int      `json:"bitrate"`
	Codec            string   `json:"codec"`
	ReliabilityScore float64  `json:"reliability_score"`
	Featured         bool     `json:"featured"`
}

func toStationResponse(s *store.Station) stationResponse {
	tags := s.Tags
	if tags == nil {
		tags = []string{}
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
		Genre:            s.Genre,
		Language:         s.Language,
		Country:          s.Country,
		City:             s.City,
		CountryCode:      s.CountryCode,
		Tags:             tags,
		Bitrate:          s.Bitrate,
		Codec:            s.Codec,
		ReliabilityScore: s.ReliabilityScore,
		Featured:         s.Featured,
	}
}

// ListStations handles GET /stations
// Query params: q, genre, country, language, min_bitrate, featured, sort, limit, offset
func (h *Handler) ListStations(c *gin.Context) {
	f := store.StationFilter{
		Search:       strings.TrimSpace(c.Query("q")),
		Genre:        strings.ToLower(c.Query("genre")),
		CountryCode:  strings.ToUpper(c.Query("country")),
		Language:     strings.ToLower(c.Query("language")),
		MinBitrate:   queryInt(c, "min_bitrate", 0),
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

	resp := make([]stationResponse, len(stations))
	for i, s := range stations {
		resp[i] = toStationResponse(s)
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
	c.JSON(http.StatusOK, toStationResponse(station))
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

	resp := make([]stationResponse, len(stations))
	for i, s := range stations {
		resp[i] = toStationResponse(s)
	}
	c.JSON(http.StatusOK, gin.H{"stations": resp, "total": total})
}

// GetFilters handles GET /stations/filters — returns available genres, countries, and languages.
func (h *Handler) GetFilters(c *gin.Context) {
	genres, err := h.stationStore.Genres(c.Request.Context())
	if err != nil {
		h.log.Error("get genres", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	languages, err := h.stationStore.Languages(c.Request.Context())
	if err != nil {
		h.log.Error("get languages", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	countries, err := h.stationStore.Countries(c.Request.Context())
	if err != nil {
		h.log.Error("get countries", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	type countryItem struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	countryResp := make([]countryItem, len(countries))
	for i, c := range countries {
		countryResp[i] = countryItem{Code: c[0], Name: c[1]}
	}

	if genres == nil {
		genres = []string{}
	}
	if languages == nil {
		languages = []string{}
	}
	c.JSON(http.StatusOK, gin.H{
		"genres":    genres,
		"countries": countryResp,
		"languages": languages,
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
