package handler

import (
	"context"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/middleware"
)

func requestLogAttrs(ctx context.Context) []any {
	attrs := make([]any, 0, 4)
	if requestID := middleware.RequestIDFromContext(ctx); requestID != "" {
		attrs = append(attrs, "request_id", requestID)
	}
	if traceID := middleware.TraceIDFromContext(ctx); traceID != "" {
		attrs = append(attrs, "trace_id", traceID)
	}
	return attrs
}
