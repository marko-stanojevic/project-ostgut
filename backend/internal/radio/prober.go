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
	reprobeTimeout = 10 * time.Second
)

// Prober periodically re-probes active stream variants for approved stations to
// refresh resolved_url, detected codec/bitrate, metadata routing, and last_error.
type Prober struct {
	streamStore    *store.StationStreamStore
	log            *slog.Logger
	client         *http.Client
	metadataRouter *MetadataRouter
	mu             sync.Mutex
}

// NewProber creates a Prober.
func NewProber(streamStore *store.StationStreamStore, log *slog.Logger, browserProbeOrigins []string) *Prober {
	client := &http.Client{Timeout: reprobeTimeout}
	return &Prober{
		streamStore:    streamStore,
		log:            log,
		client:         client,
		metadataRouter: NewMetadataRouter(client, browserProbeOrigins),
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

// IsRunning reports whether a stream re-probe is currently in progress.
func (p *Prober) IsRunning() bool {
	if p.mu.TryLock() {
		p.mu.Unlock()
		return false
	}
	return true
}

// Trigger starts a manual stream re-probe if one is not already running.
func (p *Prober) Trigger(ctx context.Context) bool {
	if !p.mu.TryLock() {
		p.log.Info("stream re-probe skipped", "event", "stream_reprobe_skipped", "trigger", "manual", "reason", "already_running")
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
		p.log.Info("stream re-probe skipped", "event", "stream_reprobe_skipped", "trigger", "scheduled", "reason", "already_running")
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

	p.log.Info("stream re-probe cycle started", "event", "stream_reprobe_cycle_started", "due_approved_streams", len(streams))
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

			routing := p.metadataRouter.Classify(ctx, MetadataRouteInput{
				StreamURL:       resolverURL,
				MetadataURLHint: derefString(stream.MetadataURL),
				Kind:            resolverKind,
				Container:       resolverContainer,
				MetadataEnabled: stream.MetadataEnabled,
				MetadataType:    stream.MetadataType,
			})
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
				MetadataResolver:          routing.Resolver,
				MetadataResolverCheckedAt: &routing.CheckedAt,
				MetadataURL:               routing.MetadataURL,
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
				p.log.Warn("stream re-probe update failed", "event", "stream_reprobe_update_failed", "stream_id", stream.ID, "error", err)
			}
		}(s)
	}

	wg.Wait()
	p.log.Info("stream re-probe cycle completed",
		"event", "stream_reprobe_cycle_completed",
		"due_approved_streams", len(streams),
		"duration_ms", time.Since(start).Milliseconds(),
	)
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
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
