package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	ctxKeyRequestID = "request_id"
	ctxKeyTraceID   = "trace_id"
)

type requestContextKey string

const (
	requestIDContextKey requestContextKey = "request_id"
	traceIDContextKey   requestContextKey = "trace_id"
)

// RequestLogger stamps request correlation fields and writes one structured
// completion event for every HTTP request.
func RequestLogger(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now()
		requestID := requestIDFromHeader(c.GetHeader("X-Request-ID"))
		if requestID == "" {
			requestID = newRequestID()
		}
		traceID := traceIDFromTraceparent(c.GetHeader("traceparent"))

		c.Set(ctxKeyRequestID, requestID)
		if traceID != "" {
			c.Set(ctxKeyTraceID, traceID)
		}
		c.Header("X-Request-ID", requestID)

		ctx := context.WithValue(c.Request.Context(), requestIDContextKey, requestID)
		if traceID != "" {
			ctx = context.WithValue(ctx, traceIDContextKey, traceID)
		}
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}
		attrs := []any{
			"event", "http_request_completed",
			"request_id", requestID,
			"method", c.Request.Method,
			"path", path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(startedAt).Milliseconds(),
			"response_bytes", c.Writer.Size(),
			"client_ip", c.ClientIP(),
		}
		if traceID != "" {
			attrs = append(attrs, "trace_id", traceID)
		}
		if userID := GetUserID(c); userID != "" {
			attrs = append(attrs, "user_id", userID)
		}
		if len(c.Errors) > 0 {
			attrs = append(attrs, "error", c.Errors.String())
		}

		status := c.Writer.Status()
		switch {
		case status >= http.StatusInternalServerError:
			logger.Error("http request completed", attrs...)
		case status >= http.StatusBadRequest:
			logger.Warn("http request completed", attrs...)
		default:
			logger.Info("http request completed", attrs...)
		}
	}
}

// GetRequestID retrieves the request ID stamped by RequestLogger.
func GetRequestID(c *gin.Context) string {
	v, _ := c.Get(ctxKeyRequestID)
	if id, ok := v.(string); ok {
		return id
	}
	return ""
}

// RequestIDFromContext retrieves the request ID from a standard context.
func RequestIDFromContext(ctx context.Context) string {
	if id, ok := ctx.Value(requestIDContextKey).(string); ok {
		return id
	}
	return ""
}

// TraceIDFromContext retrieves the W3C trace ID from a standard context.
func TraceIDFromContext(ctx context.Context) string {
	if id, ok := ctx.Value(traceIDContextKey).(string); ok {
		return id
	}
	return ""
}

func requestIDFromHeader(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 128 {
		return ""
	}
	return value
}

func newRequestID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(b[:])
}

func traceIDFromTraceparent(value string) string {
	parts := strings.Split(strings.TrimSpace(value), "-")
	if len(parts) < 4 || len(parts[1]) != 32 {
		return ""
	}
	return parts[1]
}
