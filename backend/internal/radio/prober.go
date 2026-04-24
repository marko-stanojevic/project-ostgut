package radio

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

const (
	// ReprobeInterval is how often the background prober refreshes all active streams.
	ReprobeInterval = 12 * time.Hour

	// reprobeWorkers limits concurrent HTTP probes so we don't hammer CDNs.
	reprobeWorkers = 10

	// reprobeTimeout is the per-stream HTTP probe deadline.
	reprobeTimeout       = 10 * time.Second
	resolverProbeTimeout = 8 * time.Second
)

// Prober periodically re-probes every active stream variant to refresh
// resolved_url, detected codec/bitrate, and last_error.
type Prober struct {
	streamStore         *store.StationStreamStore
	log                 *slog.Logger
	client              *http.Client
	browserProbeOrigins []string
}

// NewProber creates a Prober.
func NewProber(streamStore *store.StationStreamStore, log *slog.Logger, browserProbeOrigins []string) *Prober {
	return &Prober{
		streamStore:         streamStore,
		log:                 log,
		client:              &http.Client{Timeout: reprobeTimeout},
		browserProbeOrigins: append([]string(nil), browserProbeOrigins...),
	}
}

// Run blocks, re-probing all active streams on ReprobeInterval.
// It probes once on startup so newly-ingested streams are classified quickly.
func (p *Prober) Run(ctx context.Context) {
	p.reprobeAll(ctx)
	ticker := time.NewTicker(ReprobeInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			p.reprobeAll(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (p *Prober) reprobeAll(ctx context.Context) {
	streams, err := p.streamStore.ListAllActive(ctx)
	if err != nil {
		p.log.Error("prober: list active streams", "error", err)
		return
	}

	p.log.Info("prober: starting re-probe cycle", "streams", len(streams))
	start := time.Now()

	sem := make(chan struct{}, reprobeWorkers)
	var wg sync.WaitGroup

	for _, s := range streams {
		wg.Add(1)
		sem <- struct{}{}
		go func(stream *store.StationStream) {
			defer wg.Done()
			defer func() { <-sem }()

			probeCtx, probeCancel := context.WithTimeout(ctx, reprobeTimeout)
			result := ProbeStreamWithOptions(probeCtx, p.client, stream.URL, StreamProbeOptions{
				IncludeLoudness: false,
			})
			probeCancel()

			resolverURL := strings.TrimSpace(result.ResolvedURL)
			if resolverURL == "" {
				resolverURL = strings.TrimSpace(stream.ResolvedURL)
			}
			if resolverURL == "" {
				resolverURL = strings.TrimSpace(stream.URL)
			}

			resolverKind := strings.TrimSpace(result.Kind)
			if resolverKind == "" {
				resolverKind = strings.TrimSpace(stream.Kind)
			}
			if resolverKind == "" {
				resolverKind = "direct"
			}

			resolverContainer := strings.TrimSpace(result.Container)
			if resolverContainer == "" {
				resolverContainer = strings.TrimSpace(stream.Container)
			}
			if resolverContainer == "" {
				resolverContainer = "none"
			}

			resolverCheckedAt := time.Now().UTC()
			resolverProbeCtx, resolverCancel := context.WithTimeout(ctx, resolverProbeTimeout)
			clientMetadata := ProbeClientMetadataSupport(
				resolverProbeCtx,
				p.client,
				p.browserProbeOrigins,
				resolverURL,
				resolverKind,
				resolverContainer,
				stream.MetadataEnabled,
				stream.MetadataType,
			)
			resolverCancel()
			hlsID3Supported := false
			if stream.MetadataEnabled && strings.EqualFold(resolverKind, "hls") {
				hlsProbeCtx, hlsCancel := context.WithTimeout(ctx, resolverProbeTimeout)
				hlsID3Supported = ProbeHLSID3Support(hlsProbeCtx, p.client, resolverURL)
				hlsCancel()
			}
			if !clientMetadata.CheckedAt.IsZero() {
				resolverCheckedAt = clientMetadata.CheckedAt
			}
			nextResolver := ResolveMetadataResolver(stream.MetadataEnabled, clientMetadata.Supported)
			if strings.EqualFold(resolverKind, "hls") {
				if hlsID3Supported {
					nextResolver = "client"
				} else {
					nextResolver = "none"
				}
			}
			if shouldPreferClientResolver(stream, resolverKind, resolverContainer, nextResolver) {
				nextResolver = "client"
			}
			nextMetadataURL := normalizeMetadataValue(clientMetadata.MetadataURL)
			if strings.EqualFold(nextResolver, "client") && nextMetadataURL == nil && strings.EqualFold(resolverKind, "hls") {
				nextMetadataURL = normalizeMetadataValue(resolverURL)
			}
			if shouldKeepExistingClientResolver(stream, nextResolver) {
				nextResolver = "client"
				if nextMetadataURL == nil {
					nextMetadataURL = stream.MetadataURL
				}
			}
			nextHealth := nextProbeHealthScore(stream.HealthScore, result.LastError == nil)

			if err := p.streamStore.UpdateProbeResult(ctx, stream.ID, store.ProbeUpdate{
				ResolvedURL:               result.ResolvedURL,
				Kind:                      result.Kind,
				Container:                 result.Container,
				Transport:                 result.Transport,
				MimeType:                  result.MimeType,
				Codec:                     result.Codec,
				Bitrate:                   result.Bitrate,
				BitDepth:                  result.BitDepth,
				SampleRateHz:              result.SampleRateHz,
				SampleRateConfidence:      result.SampleRateConfidence,
				Channels:                  result.Channels,
				HealthScore:               &nextHealth,
				IncludeMetadataResolver:   true,
				MetadataResolver:          nextResolver,
				MetadataResolverCheckedAt: &resolverCheckedAt,
				MetadataURL:               nextMetadataURL,
				LastCheckedAt:             result.LastCheckedAt,
				LastError:                 result.LastError,
			}); err != nil {
				// Graceful shutdown can cancel ctx while workers are flushing results.
				// Treat cancellation as expected and avoid noisy WARN logs.
				if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
					return
				}
				p.log.Warn("prober: update failed", "stream_id", stream.ID, "error", err)
			}
		}(s)
	}

	wg.Wait()
	p.log.Info("prober: re-probe cycle done",
		"streams", len(streams),
		"duration", time.Since(start).Round(time.Second),
	)
}

func nextProbeHealthScore(current float64, success bool) float64 {
	if success {
		return math.Min(1, current+0.08)
	}
	return math.Max(0, current-0.2)
}

func shouldKeepExistingClientResolver(stream *store.StationStream, nextResolver string) bool {
	if stream == nil || !stream.MetadataEnabled {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(stream.MetadataResolver), "client") {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(nextResolver), "server")
}

func shouldPreferClientResolver(
	stream *store.StationStream,
	kind string,
	container string,
	nextResolver string,
) bool {
	if stream == nil || !stream.MetadataEnabled {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(nextResolver), "server") {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(kind), "direct") || !strings.EqualFold(strings.TrimSpace(container), "none") {
		return false
	}
	return stream.MetadataSource != nil && strings.EqualFold(strings.TrimSpace(*stream.MetadataSource), "icy")
}

func normalizeMetadataValue(raw string) *string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
