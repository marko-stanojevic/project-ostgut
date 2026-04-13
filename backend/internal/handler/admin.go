package handler

import (
	"errors"
	"net/http"
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
	Status            string  `json:"status"`
	CustomLogo        *string `json:"custom_logo"`
	CustomWebsite     *string `json:"custom_website"`
	CustomDescription *string `json:"custom_description"`
	EditorNotes       *string `json:"editor_notes"`
}

func toAdminStationResponse(s *store.Station) adminStationResponse {
	return adminStationResponse{
		stationResponse:   toStationResponse(s),
		Status:            s.Status,
		CustomLogo:        s.CustomLogo,
		CustomWebsite:     s.CustomWebsite,
		CustomDescription: s.CustomDescription,
		EditorNotes:       s.EditorNotes,
	}
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
	c.JSON(http.StatusOK, gin.H{"stations": resp, "count": len(resp)})
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

// AdminUpdateStation handles PUT /admin/stations/:id
// Accepts: status, custom_logo, custom_website, custom_description, editor_notes, featured
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
		Name              *string `json:"name"`
		Status            *string `json:"status"`
		CustomLogo        *string `json:"custom_logo"`
		CustomWebsite     *string `json:"custom_website"`
		CustomDescription *string `json:"custom_description"`
		EditorNotes       *string `json:"editor_notes"`
		Featured          *bool   `json:"featured"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Merge: use incoming value if provided, else keep current.
	u := store.EnrichmentUpdate{
		Name:              current.Name,
		Status:            current.Status,
		CustomLogo:        current.CustomLogo,
		CustomWebsite:     current.CustomWebsite,
		CustomDescription: current.CustomDescription,
		EditorNotes:       current.EditorNotes,
		Featured:          current.Featured,
	}
	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
			return
		}
		u.Name = trimmed
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
	if req.CustomLogo != nil {
		u.CustomLogo = req.CustomLogo
	}
	if req.CustomWebsite != nil {
		u.CustomWebsite = req.CustomWebsite
	}
	if req.CustomDescription != nil {
		u.CustomDescription = req.CustomDescription
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
