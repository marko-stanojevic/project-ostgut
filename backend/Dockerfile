# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────
# Stage 1 – build
# ──────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

# Install ca-certificates so TLS calls work inside the container.
RUN apk add --no-cache ca-certificates git

WORKDIR /src

# Cache dependency downloads before copying source code.
COPY go.mod go.sum ./
RUN go mod download

# Copy application source and build a fully-static binary.
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" \
    -o /app/server ./cmd/api

# ──────────────────────────────────────────────
# Stage 2 – runtime (distroless, no shell)
# ──────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/server /server

# Gin / net/http listen on this port; override with the PORT env var if needed.
EXPOSE 8080

ENTRYPOINT ["/server"]
