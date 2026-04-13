package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// AdminMiddleware rejects requests from users who don't have is_admin = true.
// Must be used after AuthMiddleware (depends on "user_id" being set in context).
func AdminMiddleware(userStore *store.UserStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		isAdmin, err := userStore.IsAdmin(c.Request.Context(), userID)
		if err != nil || !isAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			c.Abort()
			return
		}

		c.Next()
	}
}
