package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
)

// UserProfile represents user profile information
type UserProfile struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// GetProfile returns the authenticated user's profile
// GET /users/me
func GetProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	email := middleware.GetUserEmail(c)

	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	profile := UserProfile{
		ID:    userID,
		Email: email,
	}

	c.JSON(http.StatusOK, profile)
}

// UpdateProfile updates the authenticated user's profile
// PUT /users/me
func UpdateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)

	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req map[string]interface{}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// In a real implementation, you would validate and save the updates
	// For now, we just return success
	c.JSON(http.StatusOK, gin.H{
		"message": "profile updated successfully",
		"user_id": userID,
	})
}
