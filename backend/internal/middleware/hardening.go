package middleware

import (
	"mime"
	"net/http"
	"strings"

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

// RequireJSON rejects POST/PUT/PATCH requests whose Content-Type is not
// application/json. Gin's default binder will happily decode form-encoded
// bodies into JSON-tagged structs, which expands the CSRF surface area —
// a cross-origin <form> can target our mutating endpoints. Enforcing JSON
// breaks that vector because browsers refuse to send application/json on
// a simple form submission, forcing CORS preflight.
//
// Routes that legitimately accept other content types (multipart upload,
// webhook bodies signed by Content-Type-sensitive providers) must opt out
// by registering on a router group that does not include this middleware.
func RequireJSON() gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch:
		default:
			c.Next()
			return
		}
		// No body → nothing to type-check (e.g. POST /auth/logout-all).
		if c.Request.ContentLength == 0 {
			c.Next()
			return
		}
		ct := c.GetHeader("Content-Type")
		if ct == "" {
			c.AbortWithStatusJSON(http.StatusUnsupportedMediaType,
				gin.H{"error": "content-type required"})
			return
		}
		mediaType, _, err := mime.ParseMediaType(ct)
		if err != nil || !strings.EqualFold(mediaType, "application/json") {
			c.AbortWithStatusJSON(http.StatusUnsupportedMediaType,
				gin.H{"error": "content-type must be application/json"})
			return
		}
		c.Next()
	}
}
