package middleware

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Claims represents the JWT claims from Supabase
type Claims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	jwt.RegisteredClaims
}

// AuthMiddleware validates JWT tokens from the Authorization header
func AuthMiddleware(logger *slog.Logger, jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			logger.Warn("missing authorization header")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}

		// Extract Bearer token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			logger.Warn("invalid authorization header format")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header"})
			c.Abort()
			return
		}

		tokenString := parts[1]

		// Parse and validate token (using Supabase JWT with HS256)
		// Note: In production, you should fetch Supabase JWKS and use RS256
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			// Validate signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			logger.Warn("invalid or expired token", "error", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}

		// Extract user info from claims
		if claims.Sub == "" {
			logger.Warn("missing subject claim in token")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			c.Abort()
			return
		}

		// Attach user info to context
		c.Set("user_id", claims.Sub)
		c.Set("user_email", claims.Email)
		c.Set("claims", claims)

		logger.Debug("auth middleware", "user_id", claims.Sub, "email", claims.Email)
		c.Next()
	}
}

// GetUserID retrieves the user ID from the request context
func GetUserID(c *gin.Context) string {
	userID, _ := c.Get("user_id")
	if id, ok := userID.(string); ok {
		return id
	}
	return ""
}

// GetUserEmail retrieves the user email from the request context
func GetUserEmail(c *gin.Context) string {
	email, _ := c.Get("user_email")
	if e, ok := email.(string); ok {
		return e
	}
	return ""
}
