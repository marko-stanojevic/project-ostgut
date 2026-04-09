package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// AuthVerifyRequest represents the verify auth request
type AuthVerifyRequest struct {
	Token string `json:"token" binding:"required"`
}

// AuthVerifyResponse represents the auth verification response
type AuthVerifyResponse struct {
	Valid  bool   `json:"valid"`
	UserID string `json:"user_id,omitempty"`
	Email  string `json:"email,omitempty"`
}

// AuthVerify validates a JWT token
// POST /auth/verify
func AuthVerify(c *gin.Context) {
	var req AuthVerifyRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// In a real implementation, you would validate the token signature
	// This is a simple placeholder that assumes the token was already validated
	// by the middleware. For a public endpoint, you'd need to implement
	// full JWT validation here.

	c.JSON(http.StatusOK, AuthVerifyResponse{
		Valid: true,
	})
}
