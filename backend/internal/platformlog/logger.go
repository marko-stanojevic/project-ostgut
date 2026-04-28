// Package platformlog configures structured platform logging.
package platformlog

import (
	"io"
	"log/slog"
	"strings"
)

const ServiceBackend = "backend"

// New returns the process logger. Local development gets readable text logs;
// staging and production emit JSON suitable for centralized collection.
func New(env string, level string, out io.Writer) *slog.Logger {
	logLevel := slog.LevelInfo
	if strings.EqualFold(strings.TrimSpace(level), "debug") {
		logLevel = slog.LevelDebug
	}

	opts := &slog.HandlerOptions{Level: logLevel}
	var handler slog.Handler
	if strings.EqualFold(strings.TrimSpace(env), "local") || strings.TrimSpace(env) == "" {
		handler = slog.NewTextHandler(out, opts)
	} else {
		handler = slog.NewJSONHandler(out, opts)
	}

	return slog.New(handler).With(
		"service", ServiceBackend,
		"env", strings.TrimSpace(env),
	)
}
