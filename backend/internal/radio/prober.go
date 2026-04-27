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
	reprobeWorkers    = 10
	reprobeBatchLimit = 500

	// reprobeTimeout is the per-stream HTTP probe deadline.
	reprobeTimeout       = 10 * time.Second
	resolverProbeTimeout = 8 * time.Second
)

// Prober periodically re-probes active stream variants for approved stations to
// refresh resolved_url, detected codec/bitrate, metadata routing, and last_error.
type Prober struct {
	streamStore         *store.StationStreamStore
	log                 *slog.Logger
	client              *http.Client
	browserProbeOrigins []string
	mu                  sync.Mutex
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
	p.runOnce(ctx)
	ticker := time.NewTicker(ReprobeInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			p.runOnce(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// Trigger starts a manual stream re-probe if one is not already running.
func (p *Prober) Trigger(ctx context.Context) bool {
	if !p.mu.TryLock() {
		p.log.Info("prober: manual trigger skipped; re-probe already running")
		return false
	}
	go func() {
		defer p.mu.Unlock()
		p.reprobeAll(ctx)
	}()
	return true
}

func (p *Prober) runOnce(ctx context.Context) {
	if !p.mu.TryLock() {
		p.log.Info("prober: scheduled re-probe skipped; re-probe already running")
		return
	}
	defer p.mu.Unlock()
	p.reprobeAll(ctx)
}

func (p *Prober) reprobeAll(ctx context.Context) {
	now := time.Now().UTC()
	streams, err := p.streamStore.ListDueActiveForApprovedStations(ctx, now, reprobeBatchLimit)
	if err != nil {
		p.log.Error("prober: list due active approved streams", "error", err)
		return
	}

	p.log.Info("prober: starting re-probe cycle", "due_approved_streams", len(streams))
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
			hintedMetadataURL := ""
			if stream.MetadataURL != nil {
				hintedMetadataURL = strings.TrimSpace(*stream.MetadataURL)
			}
			clientMetadata := ProbeClientMetadataSupport(
				resolverProbeCtx,
				p.client,
				p.browserProbeOrigins,
				resolverURL,
				hintedMetadataURL,
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
			nextResolver := ResolveMetadataResolverForStream(stream.MetadataEnabled, resolverKind, clientMetadata.Supported, hlsID3Supported)
			nextMetadataURL := normalizeMetadataValue(clientMetadata.MetadataURL)
			if strings.EqualFold(nextResolver, "client") && nextMetadataURL == nil && strings.EqualFold(resolverKind, "hls") {
				nextMetadataURL = normalizeMetadataValue(resolverURL)
			}
			nextHealth := nextProbeHealthScore(stream.HealthScore, result.LastError == nil)
			nextProbeAt := NextProbeAt(result.LastCheckedAt, result.LastErrorCode)

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
				NextProbeAt:               &nextProbeAt,
				LastCheckedAt:             result.LastCheckedAt,
				LastError:                 result.LastError,
				LastErrorCode:             result.LastErrorCode,
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
		"due_approved_streams", len(streams),
		"duration", time.Since(start).Round(time.Second),
	)
}

// NextProbeAt returns the next recurring maintenance time for a probe result.
// Stable streams use the full cadence; transient failures retry sooner; static
// policy or playlist-shape failures back off longer to avoid repeated waste.
func NextProbeAt(checkedAt time.Time, errorCode string) time.Time {
	if checkedAt.IsZero() {
		checkedAt = time.Now().UTC()
	}
	checkedAt = checkedAt.UTC()

	switch ProbeFailureCode(strings.TrimSpace(errorCode)) {
	case "":
		return checkedAt.Add(ReprobeInterval)
	case ProbeFailureTimeout, ProbeFailureRequestFailed:
		return checkedAt.Add(1 * time.Hour)
	case ProbeFailureHTTPStatus:
		return checkedAt.Add(6 * time.Hour)
	case ProbeFailureInvalidURL, ProbeFailureUnsupportedScheme, ProbeFailureDisallowedHost, ProbeFailureTooManyRedirects, ProbeFailureRedirectUnsupportedScheme, ProbeFailureTooManyHostChanges, ProbeFailurePlaylistDepthExceeded, ProbeFailurePlaylistEmpty, ProbeFailurePlaylistReadFailed:
		return checkedAt.Add(24 * time.Hour)
	default:
		return checkedAt.Add(3 * time.Hour)
	}
}

func nextProbeHealthScore(current float64, success bool) float64 {
	if success {
		return math.Min(1, current+0.08)
	}
	return math.Max(0, current-0.2)
}

func normalizeMetadataValue(raw string) *string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
