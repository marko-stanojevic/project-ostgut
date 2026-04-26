package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/authtoken"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// authResponse is the shared shape of /auth/login, /auth/register, /auth/oauth
// and /auth/refresh responses. It contains everything a client needs to call
// the API and to schedule its next refresh.
type authResponse struct {
	AccessToken           string    `json:"accessToken"`
	AccessTokenExpiresAt  time.Time `json:"accessTokenExpiresAt"`
	RefreshToken          string    `json:"refreshToken"`
	RefreshTokenExpiresAt time.Time `json:"refreshTokenExpiresAt"`
	User                  userInfo  `json:"user"`
}

type userInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

func (h *Handler) issueAccessToken(u *store.User) (token string, expiresAt time.Time, err error) {
	expiresAt = time.Now().Add(authtoken.DefaultTTL)
	token, err = authtoken.Issue(h.auth.jwtSecret, u.ID, u.Email, u.Role, authtoken.DefaultTTL)
	return token, expiresAt, err
}

// issueAuthResponse mints a new access + refresh token pair for u and returns
// the response payload. Callers handle JSON encoding and status codes.
func (h *Handler) issueAuthResponse(c *gin.Context, u *store.User) (*authResponse, error) {
	accessToken, accessExp, err := h.issueAccessToken(u)
	if err != nil {
		return nil, err
	}
	refresh, err := h.auth.refresh.Issue(c.Request.Context(), u.ID, store.DefaultRefreshTokenTTL)
	if err != nil {
		return nil, err
	}
	return &authResponse{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  accessExp,
		RefreshToken:          refresh.Token,
		RefreshTokenExpiresAt: refresh.ExpiresAt,
		User:                  userInfo{ID: u.ID, Email: u.Email, Name: u.Name, Role: string(u.Role)},
	}, nil
}

// Login validates credentials and returns an access + refresh token pair.
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

	u, err := h.auth.users.GetByEmail(c.Request.Context(), req.Email)
	if errors.Is(err, store.ErrNotFound) || (err == nil && !h.auth.users.CheckPassword(u.PasswordHash, req.Password)) {
		// Same response for unknown email and wrong password — avoid user enumeration
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
		return
	}
	if err != nil {
		h.log.Error("login: get user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp, err := h.issueAuthResponse(c, u)
	if err != nil {
		h.log.Error("login: issue tokens", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// Register creates a new user account and returns an access + refresh token pair.
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

	u, err := h.auth.users.Create(c.Request.Context(), req.Email, req.Password)
	if errors.Is(err, store.ErrEmailTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "email already in use"})
		return
	}
	if err != nil {
		h.log.Error("register: create user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp, err := h.issueAuthResponse(c, u)
	if err != nil {
		h.log.Error("register: issue tokens", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusCreated, resp)
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

	token, err := h.auth.users.CreateResetToken(c.Request.Context(), req.Email)
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

	// TODO: replace with email send (e.g. via SendGrid / Resend / SES).
	// Until then, log only that a token was generated — never the token itself.
	h.log.Info("password reset token generated",
		"email", req.Email,
		"token_prefix", token[:8],
	)

	c.JSON(http.StatusOK, gin.H{"message": "if that email is registered, a reset link has been sent"})
}

// ResetPassword updates a user's password using a valid reset token and
// revokes every refresh token belonging to that user — the password change
// invalidates all existing sessions everywhere.
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

	userID, err := h.auth.users.ResetPassword(c.Request.Context(), req.Token, req.Password)
	if errors.Is(err, store.ErrBadToken) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired reset token"})
		return
	}
	if err != nil {
		h.log.Error("reset-password: update password", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if err := h.auth.refresh.RevokeAllForUser(c.Request.Context(), userID); err != nil {
		// Log but don't fail the response — password is already changed.
		h.log.Error("reset-password: revoke refresh tokens", "user_id", userID, "error", err)
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

// OAuthLogin finds or creates a user for an OAuth provider sign-in and
// returns an access + refresh token pair.
//
// Trust model: this endpoint is the bridge between NextAuth (which has
// already verified the provider's id_token) and the backend session. To
// prevent arbitrary HTTP clients from minting tokens for any email, the
// caller must HMAC-SHA256 the canonical handshake string
//
//	provider | provider_id | email | email_verified | timestamp
//
// with OAUTH_SHARED_SECRET (shared only with the Next.js server) and send
// the hex digest in `signature`. Timestamps older than the configured skew
// are rejected to prevent replay.
//
// POST /auth/oauth
func (h *Handler) OAuthLogin(c *gin.Context) {
	var req struct {
		Provider      string `json:"provider" binding:"required"`
		ProviderID    string `json:"provider_id" binding:"required"`
		Email         string `json:"email" binding:"required,email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Timestamp     int64  `json:"timestamp" binding:"required"`
		Signature     string `json:"signature" binding:"required"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Reject stale or future-dated handshakes (5-minute window).
	now := time.Now().Unix()
	if diff := now - req.Timestamp; diff > 300 || diff < -60 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "oauth handshake expired"})
		return
	}

	// The provider must have asserted the email is verified — otherwise an
	// attacker could register a Google/GitHub account claiming a victim's
	// email and take over an existing credentials user on first sign-in.
	if !req.EmailVerified {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "email not verified by provider"})
		return
	}

	canonical := req.Provider + "|" + req.ProviderID + "|" + req.Email + "|" +
		strconv.FormatBool(req.EmailVerified) + "|" + strconv.FormatInt(req.Timestamp, 10)
	mac := hmac.New(sha256.New, []byte(h.auth.oauthSecret))
	mac.Write([]byte(canonical))
	expected := mac.Sum(nil)
	provided, err := hex.DecodeString(req.Signature)
	if err != nil || !hmac.Equal(expected, provided) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid oauth signature"})
		return
	}

	u, err := h.auth.users.UpsertOAuthUser(c.Request.Context(), req.Provider, req.ProviderID, req.Email, req.Name)
	if err != nil {
		h.log.Error("oauth login: upsert user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	resp, err := h.issueAuthResponse(c, u)
	if err != nil {
		h.log.Error("oauth login: issue tokens", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// Refresh rotates a refresh token, re-reads the current user role from the
// database, and returns a fresh access + refresh token pair.
//
// Role re-read: this is how privilege changes (admin promotes/demotes a user)
// take effect — at the next refresh the new role is baked into the access
// token. Without this, role changes wouldn't propagate until the user
// re-authenticated.
//
// POST /auth/refresh
func (h *Handler) Refresh(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, newRefresh, err := h.auth.refresh.Rotate(c.Request.Context(), req.RefreshToken, store.DefaultRefreshTokenTTL)
	if errors.Is(err, store.ErrRefreshTokenReused) {
		// Theft signal: the same token was rotated twice. The legitimate
		// client and an attacker both hold this string. Burn every session
		// for this user and force re-auth on every device.
		h.log.Warn("refresh token reuse detected; revoking all sessions", "user_id", userID)
		if revokeErr := h.auth.refresh.RevokeAllForUser(c.Request.Context(), userID); revokeErr != nil {
			h.log.Error("refresh: revoke all on reuse", "user_id", userID, "error", revokeErr)
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "session revoked"})
		return
	}
	if errors.Is(err, store.ErrRefreshTokenInvalid) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired refresh token"})
		return
	}
	if err != nil {
		h.log.Error("refresh: rotate", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	u, err := h.auth.users.GetByID(c.Request.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user no longer exists"})
		return
	}
	if err != nil {
		h.log.Error("refresh: load user", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	accessToken, accessExp, err := h.issueAccessToken(u)
	if err != nil {
		h.log.Error("refresh: issue access token", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, authResponse{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  accessExp,
		RefreshToken:          newRefresh.Token,
		RefreshTokenExpiresAt: newRefresh.ExpiresAt,
		User:                  userInfo{ID: u.ID, Email: u.Email, Name: u.Name, Role: string(u.Role)},
	})
}

// Logout revokes the supplied refresh token. Idempotent.
// POST /auth/logout
func (h *Handler) Logout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	// Body is optional — clients without a refresh token can still call this.
	_ = c.BindJSON(&req)

	if req.RefreshToken != "" {
		if err := h.auth.refresh.Revoke(c.Request.Context(), req.RefreshToken); err != nil {
			h.log.Error("logout: revoke refresh", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
	}
	c.Status(http.StatusNoContent)
}

// LogoutAll revokes every active refresh token for the authenticated user.
// Used when a user suspects compromise ("sign out all devices"). Sits behind
// the JWT middleware on the protected group — not under /auth — because it
// requires an access token to identify the user.
// POST /users/me/sessions/revoke-all
func (h *Handler) LogoutAll(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := h.auth.refresh.RevokeAllForUser(c.Request.Context(), userID); err != nil {
		h.log.Error("logout-all: revoke refresh tokens", "user_id", userID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.Status(http.StatusNoContent)
}
