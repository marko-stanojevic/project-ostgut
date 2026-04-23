package radio

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"net/http"
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
	reprobeTimeout = 10 * time.Second
)

// Prober periodically re-probes every active stream variant to refresh
// resolved_url, detected codec/bitrate, and last_error.
type Prober struct {
	streamStore *store.StationStreamStore
	log         *slog.Logger
	client      *http.Client
}

// NewProber creates a Prober.
func NewProber(streamStore *store.StationStreamStore, log *slog.Logger) *Prober {
	return &Prober{
		streamStore: streamStore,
		log:         log,
		client:      &http.Client{Timeout: reprobeTimeout},
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

			probeCtx, cancel := context.WithTimeout(ctx, reprobeTimeout)
			result := ProbeStream(probeCtx, p.client, stream.URL)
			cancel()
			nextHealth := nextProbeHealthScore(stream.HealthScore, result.LastError == nil)

			if err := p.streamStore.UpdateProbeResult(ctx, stream.ID, store.ProbeUpdate{
				ResolvedURL:            result.ResolvedURL,
				Kind:                   result.Kind,
				Container:              result.Container,
				Transport:              result.Transport,
				MimeType:               result.MimeType,
				Codec:                  result.Codec,
				Bitrate:                result.Bitrate,
				BitDepth:               result.BitDepth,
				SampleRateHz:           result.SampleRateHz,
				SampleRateConfidence:   result.SampleRateConfidence,
				Channels:               result.Channels,
				LoudnessIntegratedLUFS: result.LoudnessIntegratedLUFS,
				LoudnessPeakDBFS:       result.LoudnessPeakDBFS,
				LoudnessSampleDuration: result.LoudnessSampleDuration,
				LoudnessMeasuredAt:     result.LoudnessMeasuredAt,
				LoudnessStatus:         result.LoudnessStatus,
				HealthScore:            &nextHealth,
				LastCheckedAt:          result.LastCheckedAt,
				LastError:              result.LastError,
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
