package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// Login validates credentials and returns user info.
// Called by the Auth.js CredentialsProvider authorize function.
// POST /auth/login
func (h *Handler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	u, err := h.store.GetByEmail(c.Request.Context(), req.Email)
	if errors.Is(err, store.ErrNotFound) || (err == nil && !h.store.CheckPassword(u.PasswordHash, req.Password)) {
		// Same response for unknown email and wrong password — avoid user enumeration
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
		return
	}
	if err != nil {
		h.log.Error("login: get user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":    u.ID,
		"email": u.Email,
		"name":  u.Name,
	})
}

// Register creates a new user account.
// POST /auth/register
func (h *Handler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	u, err := h.store.Create(c.Request.Context(), req.Email, req.Password)
	if errors.Is(err, store.ErrEmailTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "email already in use"})
		return
	}
	if err != nil {
		h.log.Error("register: create user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":    u.ID,
		"email": u.Email,
	})
}

// ForgotPassword generates a password reset token and logs the reset URL.
// In production, replace the log statement with an email send.
// POST /auth/forgot-password
func (h *Handler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	token, err := h.store.CreateResetToken(c.Request.Context(), req.Email)
	if errors.Is(err, store.ErrNotFound) {
		// Don't reveal whether the email exists
		c.JSON(http.StatusOK, gin.H{"message": "if that email is registered, a reset link has been sent"})
		return
	}
	if err != nil {
		h.log.Error("forgot-password: create token", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	// TODO: replace with email send (e.g. via SendGrid / Resend / SES)
	h.log.Info("password reset token generated",
		"email", req.Email,
		"reset_url", "/auth/reset-password?token="+token,
	)

	c.JSON(http.StatusOK, gin.H{"message": "if that email is registered, a reset link has been sent"})
}

// ResetPassword updates a user's password using a valid reset token.
// POST /auth/reset-password
func (h *Handler) ResetPassword(c *gin.Context) {
	var req struct {
		Token    string `json:"token" binding:"required"`
		Password string `json:"password" binding:"required,min=8"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	err := h.store.ResetPassword(c.Request.Context(), req.Token, req.Password)
	if errors.Is(err, store.ErrBadToken) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired reset token"})
		return
	}
	if err != nil {
		h.log.Error("reset-password: update password", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

// OAuthLogin finds or creates a user for an OAuth provider sign-in.
// Called by the Auth.js jwt callback after a successful OAuth flow.
// POST /auth/oauth
func (h *Handler) OAuthLogin(c *gin.Context) {
	var req struct {
		Provider   string `json:"provider" binding:"required"`
		ProviderID string `json:"provider_id" binding:"required"`
		Email      string `json:"email" binding:"required,email"`
		Name       string `json:"name"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	u, err := h.store.UpsertOAuthUser(c.Request.Context(), req.Provider, req.ProviderID, req.Email, req.Name)
	if err != nil {
		h.log.Error("oauth login: upsert user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":    u.ID,
		"email": u.Email,
		"name":  u.Name,
	})
}

// AuthVerify validates a JWT and returns the token subject when valid.
// POST /auth/verify
func (h *Handler) AuthVerify(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	claims, err := middleware.ValidateJWTToken(req.Token, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"valid": false, "error": "invalid or expired token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid": true,
		"sub":   claims.Sub,
		"email": claims.Email,
	})
}
