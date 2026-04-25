// Package middleware contains HTTP middleware shared by handlers.
package middleware

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/authtoken"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// Context keys for values stamped onto the gin context by AuthMiddleware.
const (
	ctxKeyUserID    = "user_id"
	ctxKeyUserEmail = "user_email"
	ctxKeyUserRole  = "user_role"
)

var (
	errMissingAuthorizationHeader = errors.New("missing authorization header")
	errInvalidAuthorizationHeader = errors.New("invalid authorization header")
)

// AuthMiddleware validates HS256 access tokens issued by the backend
// (see internal/authtoken). On success it stamps user_id, user_email, and
// user_role onto the gin context.
func AuthMiddleware(logger *slog.Logger, jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString, err := BearerTokenFromHeader(c.GetHeader("Authorization"))
		if err != nil {
			if errors.Is(err, errMissingAuthorizationHeader) {
				logger.Warn("missing authorization header")
				c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			} else {
				logger.Warn("invalid authorization header format")
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header"})
			}
			c.Abort()
			return
		}

		claims, err := authtoken.Validate(tokenString, jwtSecret)
		if err != nil {
			logger.Warn("invalid or expired token", "error", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}

		c.Set(ctxKeyUserID, claims.Sub)
		c.Set(ctxKeyUserEmail, claims.Email)
		c.Set(ctxKeyUserRole, store.Role(claims.Role))

		c.Next()
	}
}

// RequireRole rejects requests whose access token role is not in allowed.
// Must be used after AuthMiddleware.
func RequireRole(allowed ...store.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetRole(c)
		for _, r := range allowed {
			if role == r {
				c.Next()
				return
			}
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		c.Abort()
	}
}

// BearerTokenFromHeader extracts a bearer token from an Authorization header.
func BearerTokenFromHeader(header string) (string, error) {
	header = strings.TrimSpace(header)
	if header == "" {
		return "", errMissingAuthorizationHeader
	}

	parts := strings.Split(header, " ")
	if len(parts) != 2 || parts[0] != "Bearer" || strings.TrimSpace(parts[1]) == "" {
		return "", errInvalidAuthorizationHeader
	}

	return parts[1], nil
}

// GetUserID retrieves the user ID from the request context.
func GetUserID(c *gin.Context) string {
	v, _ := c.Get(ctxKeyUserID)
	if id, ok := v.(string); ok {
		return id
	}
	return ""
}

// GetUserEmail retrieves the user email from the request context.
func GetUserEmail(c *gin.Context) string {
	v, _ := c.Get(ctxKeyUserEmail)
	if e, ok := v.(string); ok {
		return e
	}
	return ""
}

// GetRole retrieves the user role from the request context. Returns the empty
// Role when not set (e.g. unauthenticated routes).
func GetRole(c *gin.Context) store.Role {
	v, _ := c.Get(ctxKeyUserRole)
	if r, ok := v.(store.Role); ok {
		return r
	}
	return ""
}
