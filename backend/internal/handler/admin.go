package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
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
	Status string `json:"status"`
}

func toAdminStationResponse(s *store.Station) adminStationResponse {
	return adminStationResponse{
		stationResponse: toStationResponse(s),
		Status:          s.Status,
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
		Genre            string   `json:"genre"`
		Language         string   `json:"language"`
		Country          string   `json:"country"`
		CountryCode      string   `json:"country_code"`
		Tags             []string `json:"tags"`
		Bitrate          int      `json:"bitrate"`
		Codec            string   `json:"codec"`
		ReliabilityScore float64  `json:"reliability_score"`
		Status           string   `json:"status"`
		Featured         bool     `json:"featured"`
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

	bitrate := req.Bitrate
	if bitrate < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bitrate cannot be negative"})
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

	manual := store.ManualStationInput{
		Name:             name,
		StreamURL:        streamURL,
		Homepage:         strings.TrimSpace(req.Homepage),
		Favicon:          strings.TrimSpace(req.Logo),
		Genre:            strings.TrimSpace(req.Genre),
		Language:         strings.TrimSpace(req.Language),
		Country:          strings.TrimSpace(req.Country),
		CountryCode:      strings.ToUpper(strings.TrimSpace(req.CountryCode)),
		Tags:             req.Tags,
		Bitrate:          bitrate,
		Codec:            strings.TrimSpace(req.Codec),
		ReliabilityScore: reliability,
		Status:           status,
		Featured:         req.Featured,
	}

	created, err := h.stationStore.CreateManual(c.Request.Context(), manual)
	if err != nil {
		h.log.Error("admin create station", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusCreated, toAdminStationResponse(created))
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

	resp := make([]adminStationResponse, len(stations))
	for i, s := range stations {
		resp[i] = toAdminStationResponse(s)
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
	c.JSON(http.StatusOK, toAdminStationResponse(s))
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
		Name             *string   `json:"name"`
		StreamURL        *string   `json:"stream_url"`
		Website          *string   `json:"website"`
		Logo             *string   `json:"logo"`
		Genre            *string   `json:"genre"`
		Language         *string   `json:"language"`
		Country          *string   `json:"country"`
		CountryCode      *string   `json:"country_code"`
		Tags             *[]string `json:"tags"`
		Bitrate          *int      `json:"bitrate"`
		Codec            *string   `json:"codec"`
		ReliabilityScore *float64  `json:"reliability_score"`
		Status           *string   `json:"status"`
		EditorNotes      *string   `json:"editor_notes"`
		Featured         *bool     `json:"featured"`
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
		Favicon:          current.Favicon,
		Genre:            current.Genre,
		Language:         current.Language,
		Country:          current.Country,
		CountryCode:      current.CountryCode,
		Tags:             current.Tags,
		Bitrate:          current.Bitrate,
		Codec:            current.Codec,
		ReliabilityScore: current.ReliabilityScore,
		Status:           current.Status,
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
		u.Favicon = strings.TrimSpace(*req.Logo)
	}
	if req.Genre != nil {
		u.Genre = strings.TrimSpace(*req.Genre)
	}
	if req.Language != nil {
		u.Language = strings.TrimSpace(*req.Language)
	}
	if req.Country != nil {
		u.Country = strings.TrimSpace(*req.Country)
	}
	if req.CountryCode != nil {
		u.CountryCode = strings.ToUpper(strings.TrimSpace(*req.CountryCode))
	}
	if req.Tags != nil {
		u.Tags = *req.Tags
	}
	if req.Bitrate != nil {
		if *req.Bitrate < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bitrate cannot be negative"})
			return
		}
		u.Bitrate = *req.Bitrate
	}
	if req.Codec != nil {
		u.Codec = strings.TrimSpace(*req.Codec)
	}
	if req.ReliabilityScore != nil {
		if *req.ReliabilityScore < 0 || *req.ReliabilityScore > 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "reliability_score must be between 0 and 1"})
			return
		}
		u.ReliabilityScore = *req.ReliabilityScore
	}
	if req.Status != nil {
		switch *req.Status {
		case "approved", "rejected", "pending":
			u.Status = *req.Status
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "status must be pending, approved, or rejected"})
			return
		}
	}
	if req.EditorNotes != nil {
		u.EditorNotes = req.EditorNotes
	}
	if req.Featured != nil {
		u.Featured = *req.Featured
	}

	if err := h.stationStore.UpdateEnrichment(c.Request.Context(), id, u); err != nil {
		h.log.Error("admin update station", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	updated, _ := h.stationStore.GetByIDAdmin(c.Request.Context(), id)
	c.JSON(http.StatusOK, toAdminStationResponse(updated))
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
