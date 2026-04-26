package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxBodySize wraps each request body in an http.MaxBytesReader so handlers
// cannot be pinned by a slow client streaming gigabytes of JSON. Routes with
// legitimately large payloads (image uploads) opt out by being registered
// without this middleware and applying their own io.LimitReader.
func MaxBodySize(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}

// SecurityHeaders sets baseline security response headers on every API
// response. The frontend sets its own CSP / HSTS suite; these are the
// minimum headers an API endpoint should carry, regardless of the caller.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		// API responses are not designed to be embedded; deny it explicitly.
		h.Set("Cross-Origin-Resource-Policy", "same-site")
		c.Next()
	}
}
