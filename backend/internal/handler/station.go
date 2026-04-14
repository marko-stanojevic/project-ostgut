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
// Custom fields override the Radio Browser defaults when present.
type stationResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	StreamURL string `json:"stream_url"`
	// Logo: custom_logo if set, else favicon
	Logo string `json:"logo,omitempty"`
	// Website: custom_website if set, else homepage
	Website          string   `json:"website,omitempty"`
	Description      *string  `json:"description,omitempty"`
	EditorNotes      *string  `json:"editor_notes,omitempty"`
	Genre            string   `json:"genre"`
	Language         string   `json:"language"`
	Country          string   `json:"country"`
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

	logo := s.Favicon
	if s.CustomLogo != nil && *s.CustomLogo != "" {
		logo = *s.CustomLogo
	}

	website := s.Homepage
	if s.CustomWebsite != nil && *s.CustomWebsite != "" {
		website = *s.CustomWebsite
	}

	name := s.Name
	if s.CustomName != nil && *s.CustomName != "" {
		name = *s.CustomName
	}

	return stationResponse{
		ID:               s.ID,
		Name:             name,
		StreamURL:        s.StreamURL,
		Logo:             logo,
		Website:          website,
		Description:      s.CustomDescription,
		EditorNotes:      s.EditorNotes,
		Genre:            s.Genre,
		Language:         s.Language,
		Country:          s.Country,
		CountryCode:      s.CountryCode,
		Tags:             tags,
		Bitrate:          s.Bitrate,
		Codec:            s.Codec,
		ReliabilityScore: s.ReliabilityScore,
		Featured:         s.Featured,
	}
}

// ListStations handles GET /stations
// Query params: genre, country, language, featured, limit, offset
func (h *Handler) ListStations(c *gin.Context) {
	f := store.StationFilter{
		Genre:        strings.ToLower(c.Query("genre")),
		CountryCode:  strings.ToUpper(c.Query("country")),
		Language:     strings.ToLower(c.Query("language")),
		Sort:         c.Query("sort"),
		FeaturedOnly: c.Query("featured") == "true",
		Limit:        queryInt(c, "limit", 50),
		Offset:       queryInt(c, "offset", 0),
	}
	if f.Limit > 100 {
		f.Limit = 100
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
	c.JSON(http.StatusOK, gin.H{"stations": resp, "count": len(resp)})
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
	c.JSON(http.StatusOK, gin.H{"stations": resp, "count": len(resp)})
}

// GetFilters handles GET /stations/filters — returns available genres + countries.
func (h *Handler) GetFilters(c *gin.Context) {
	genres, err := h.stationStore.Genres(c.Request.Context())
	if err != nil {
		h.log.Error("get genres", "error", err)
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
	if countryResp == nil {
		countryResp = []countryItem{}
	}
	c.JSON(http.StatusOK, gin.H{
		"genres":    genres,
		"countries": countryResp,
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
