# syntax=docker/dockerfile:1.7

# ──────────────────────────────────────────────
# Stage 1 – build
# ──────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

# Install ca-certificates so TLS calls work inside the container.
RUN apk add --no-cache ca-certificates git

WORKDIR /src

# Cache dependency downloads before copying source code.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

# Copy application source and build a fully-static binary.
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" \
    -o /app/server ./cmd/api

# ──────────────────────────────────────────────
# Stage 2 – runtime
# ──────────────────────────────────────────────
FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates ffmpeg \
    && adduser -D -u 65532 nonroot

COPY --from=builder /app/server /server

USER nonroot

# Gin / net/http listen on this port; override with the PORT env var if needed.
EXPOSE 8080

ENTRYPOINT ["/server"]
