package metadata

import (
	"context"
	"errors"
)

// Sentinel errors. Producers wrap them with %w so callers can branch on
// errors.Is rather than string-sniffing err.Error().
var (
	ErrNoMetaint      = errors.New("metadata: no Icy-Metaint header")
	ErrInvalidMetaint = errors.New("metadata: invalid Icy-Metaint")
	ErrICYProtocol    = errors.New("metadata: ICY status line not parseable by net/http")
	ErrICYRead        = errors.New("metadata: icy block read failed")
	ErrNoStreamTitle  = errors.New("metadata: no stream title in ICY blocks")
	ErrEmptyMetadata  = errors.New("metadata: empty metadata")
	ErrUpstreamStatus = errors.New("metadata: upstream non-200")
	ErrParse          = errors.New("metadata: parse failed")
	ErrUnsupported    = errors.New("metadata: unsupported endpoint")
)

// errorCodeFromErr classifies an error into a stable public error code.
// Fully sentinel-driven; no string matching.
func errorCodeFromErr(err error) string {
	if err == nil {
		return ErrorCodeNoMeta
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		return ErrorCodeTimeout
	case errors.Is(err, ErrICYProtocol):
		return ErrorCodeProtocol
	case errors.Is(err, ErrParse):
		return ErrorCodeParse
	case errors.Is(err, ErrUpstreamStatus):
		return ErrorCodeStatus
	case errors.Is(err, ErrNoMetaint),
		errors.Is(err, ErrInvalidMetaint),
		errors.Is(err, ErrNoStreamTitle),
		errors.Is(err, ErrEmptyMetadata),
		errors.Is(err, ErrUnsupported):
		return ErrorCodeNoMeta
	default:
		return ErrorCodeFetch
	}
}

// isICYProtocolError reports whether err stems from a server that sent an
// "ICY 200 OK" status line which Go's net/http parser cannot handle. Callers
// fall back to fetchICYRaw when this is true.
func isICYProtocolError(err error) bool {
	return errors.Is(err, ErrICYProtocol)
}
