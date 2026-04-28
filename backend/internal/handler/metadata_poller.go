// Package handler — metadata_poller drives upstream now-playing fetches for
// streams whose resolver is `server`, fanning the result out to all active
// listeners over SSE.
//
// Design:
//   - One goroutine per *active* stream (streams with ≥1 subscriber).
//   - Subscriber count drives lifecycle: 0→1 starts polling, 1→0 stops it.
//   - One upstream fetch per stream per cadence, regardless of listener count.
//   - HLS-only streams and streams resolved to `client`/`none` are no-ops.
package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/radio"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

const (
	pollerCadenceFast          = 30 * time.Second
	pollerCadenceSlow          = 3 * time.Minute
	pollerMaxFastMiss          = 3
	pollerFetchBudget          = 22 * time.Second
	pollerMaxConcurrentFetches = 6
)

// Snapshot is the broadcast envelope sent to SSE subscribers. It mirrors the
// shape returned by the GET /now-playing endpoint so the client uses one type.
type Snapshot struct {
	Title       string    `json:"title"`
	Artist      string    `json:"artist,omitempty"`
	Song        string    `json:"song,omitempty"`
	Source      string    `json:"source"`
	MetadataURL string    `json:"metadata_url,omitempty"`
	Supported   bool      `json:"supported"`
	Status      string    `json:"status"`
	ErrorCode   string    `json:"error_code,omitempty"`
	Error       string    `json:"error,omitempty"`
	FetchedAt   time.Time `json:"fetched_at"`
}

// MetadataPoller manages per-stream upstream polling and subscriber fan-out.
type MetadataPoller struct {
	streams    *store.StationStreamStore
	now        *store.StreamNowPlayingStore
	fetcher    *metadata.Fetcher
	client     *http.Client
	origins    []string
	log        *slog.Logger
	fetchSlots chan struct{}
	bulkMu     sync.Mutex
	bulkActive bool

	mu       sync.Mutex
	channels map[string]*pollerChannel // keyed by streamID
}

type pollerChannel struct {
	streamID    string
	subscribers map[chan Snapshot]struct{}
	cancel      context.CancelFunc
	last        *Snapshot
}

// NewMetadataPoller wires the dependencies.
func NewMetadataPoller(streams *store.StationStreamStore, now *store.StreamNowPlayingStore, fetcher *metadata.Fetcher, log *slog.Logger, browserProbeOrigins []string) *MetadataPoller {
	return &MetadataPoller{
		streams:    streams,
		now:        now,
		fetcher:    fetcher,
		client:     &http.Client{Timeout: 15 * time.Second},
		origins:    append([]string(nil), browserProbeOrigins...),
		log:        log,
		fetchSlots: make(chan struct{}, pollerMaxConcurrentFetches),
		channels:   make(map[string]*pollerChannel),
	}
}

// ActiveStreamCount returns the number of streams with a live server-side metadata poll loop.
func (p *MetadataPoller) ActiveStreamCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.channels)
}

// Run blocks until ctx is cancelled. The poller does its work via subscription
// callbacks, so Run only owns shutdown coordination.
func (p *MetadataPoller) Run(ctx context.Context) {
	<-ctx.Done()

	p.mu.Lock()
	defer p.mu.Unlock()
	for _, ch := range p.channels {
		ch.cancel()
	}
}

// Subscribe registers a listener for a stream and returns a buffered channel
// plus an unsubscribe function. The first subscriber on a stream starts the
// upstream poll loop; the last subscriber stops it.
//
// If the stream's resolver is not `server`, this returns nil and a no-op
// unsubscribe — clients should not have called us.
func (p *MetadataPoller) Subscribe(stream *store.StationStream) (<-chan Snapshot, func(), *Snapshot) {
	if stream == nil || !strings.EqualFold(strings.TrimSpace(stream.MetadataResolver), "server") {
		return nil, func() {}, nil
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	ch, ok := p.channels[stream.ID]
	if !ok {
		ctx, cancel := context.WithCancel(context.Background())
		ch = &pollerChannel{
			streamID:    stream.ID,
			subscribers: make(map[chan Snapshot]struct{}),
			cancel:      cancel,
		}
		p.channels[stream.ID] = ch
		go p.pollLoop(ctx, stream, ch)
	}

	sub := make(chan Snapshot, 4)
	ch.subscribers[sub] = struct{}{}

	last := ch.last
	unsub := func() {
		p.mu.Lock()
		defer p.mu.Unlock()
		if existing, ok := p.channels[stream.ID]; ok {
			delete(existing.subscribers, sub)
			close(sub)
			if len(existing.subscribers) == 0 {
				existing.cancel()
				delete(p.channels, stream.ID)
			}
		}
	}
	return sub, unsub, last
}

// RefreshOnce performs a one-shot upstream fetch for a stream — used by the
// non-SSE GET /now-playing endpoint when its cached snapshot is stale and
// nobody else is subscribed (so no poll loop is running).
func (p *MetadataPoller) RefreshOnce(ctx context.Context, stream *store.StationStream) {
	if stream == nil || !strings.EqualFold(strings.TrimSpace(stream.MetadataResolver), "server") {
		return
	}
	// Intentional fire-and-forget. The caller's request context is dead
	// the moment the HTTP response is written; using it would cancel the
	// upstream fetch and defeat the cache-warming purpose of RefreshOnce.
	go func() { // #nosec G118 -- see comment above
		fetchCtx, cancel := context.WithTimeout(context.Background(), pollerFetchBudget)
		defer cancel()
		_, _ = p.fetchAndPersist(fetchCtx, stream, false)
	}()
}

// BulkFetchIsRunning reports whether an admin-triggered metadata coverage pass is in progress.
func (p *MetadataPoller) BulkFetchIsRunning() bool {
	p.bulkMu.Lock()
	defer p.bulkMu.Unlock()
	return p.bulkActive
}

// TriggerApprovedMetadataFetch starts an explicit admin-requested metadata
// coverage pass over every active metadata-enabled stream on approved stations.
// It reuses the poller's global upstream fetch slots so this diagnostic job
// cannot starve listener-driven polling.
func (p *MetadataPoller) TriggerApprovedMetadataFetch(ctx context.Context) bool {
	p.bulkMu.Lock()
	if p.bulkActive {
		p.bulkMu.Unlock()
		p.log.Info("metadata poller: approved metadata fetch skipped; job already running")
		return false
	}
	p.bulkActive = true
	p.bulkMu.Unlock()

	go func() {
		defer func() {
			p.bulkMu.Lock()
			p.bulkActive = false
			p.bulkMu.Unlock()
		}()
		p.fetchApprovedMetadata(ctx)
	}()
	return true
}

func (p *MetadataPoller) fetchApprovedMetadata(ctx context.Context) {
	streams, err := p.streams.ListActiveMetadataEnabledForApprovedStations(ctx)
	if err != nil {
		p.log.Error("metadata poller: list approved metadata streams", "error", err)
		return
	}

	p.log.Info("metadata poller: starting approved metadata fetch", "streams", len(streams))
	start := time.Now()
	var wg sync.WaitGroup
	jobs := make(chan *store.StationStream)
	workers := pollerMaxConcurrentFetches
	if len(streams) < workers {
		workers = len(streams)
	}
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for stream := range jobs {
				fetchCtx, cancel := context.WithTimeout(ctx, pollerFetchBudget)
				_, err := p.fetchAndPersist(fetchCtx, stream, true)
				cancel()
				if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
					p.log.Debug("metadata poller: approved metadata fetch failed", "stream_id", stream.ID, "error", err)
				}
			}
		}()
	}
	for _, stream := range streams {
		select {
		case jobs <- stream:
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return
		}
	}
	close(jobs)
	wg.Wait()
	p.log.Info("metadata poller: approved metadata fetch done", "streams", len(streams), "duration", time.Since(start).Round(time.Second))
}

func (p *MetadataPoller) pollLoop(ctx context.Context, stream *store.StationStream, ch *pollerChannel) {
	cadence := pollerCadenceFast
	misses := 0

	// Fire one immediately so first subscriber gets data fast.
	if snap, err := p.fetchAndPersist(ctx, stream, false); err == nil && snap != nil {
		p.broadcast(ch, *snap)
		if isNoMetadataSnapshot(snap) {
			return
		}
		if snap.Title == "" {
			misses++
		} else {
			misses = 0
		}
	}

	timer := time.NewTimer(cadence)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			snap, err := p.fetchAndPersist(ctx, stream, false)
			if err == nil && snap != nil {
				p.broadcast(ch, *snap)
				if isNoMetadataSnapshot(snap) {
					return
				}
				if snap.Title == "" {
					misses++
				} else {
					misses = 0
				}
			}
			if misses >= pollerMaxFastMiss {
				cadence = pollerCadenceSlow
			} else {
				cadence = pollerCadenceFast
			}
			timer.Reset(cadence)
		}
	}
}

func (p *MetadataPoller) fetchAndPersist(ctx context.Context, stream *store.StationStream, forceUpstream bool) (*Snapshot, error) {
	fetchCtx, cancel := context.WithTimeout(ctx, pollerFetchBudget)
	defer cancel()
	release, ok := p.acquireFetchSlot(fetchCtx)
	if !ok {
		return nil, fetchCtx.Err()
	}
	defer release()

	streamURL := strings.TrimSpace(stream.ResolvedURL)
	if streamURL == "" {
		streamURL = strings.TrimSpace(stream.URL)
	}
	if streamURL == "" {
		return nil, errors.New("no stream url")
	}

	cfg := metadata.Config{
		Enabled:        true,
		Type:           stream.MetadataType,
		SourceHint:     stringValue(stream.MetadataSource),
		MetadataURL:    stringValue(stream.MetadataURL),
		DelayedICY:     stream.MetadataDelayed,
		Provider:       stringValue(stream.MetadataProvider),
		ProviderConfig: stream.MetadataProviderConfig,
	}
	var (
		np *metadata.NowPlaying
		ev metadata.FetchEvidence
	)
	if forceUpstream {
		np, ev = p.fetcher.Probe(fetchCtx, streamURL, cfg)
	} else {
		np, ev = p.fetcher.Fetch(fetchCtx, streamURL, cfg)
	}

	persistCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	snap := store.StreamNowPlaying{
		StreamID:    stream.ID,
		Title:       np.Title,
		Artist:      np.Artist,
		Song:        np.Song,
		Source:      np.Source,
		MetadataURL: optionalString(np.MetadataURL),
		Error:       optionalString(np.Error),
		ErrorCode:   optionalString(np.ErrorCode),
		FetchedAt:   np.FetchedAt,
	}
	if err := p.now.Upsert(persistCtx, snap); err != nil {
		p.log.Warn("metadata poller: persist snapshot failed", "stream_id", stream.ID, "error", err)
	}
	if np.ErrorCode == metadata.ErrorCodeNoMeta {
		checkedAt := np.FetchedAt.UTC()
		if checkedAt.IsZero() {
			checkedAt = time.Now().UTC()
		}
		snapshot := p.metadataResolverSnapshotAfterNoMetadata(fetchCtx, stream, checkedAt, ev.DelayedICY)
		if err := p.streams.UpdateMetadataResolver(persistCtx, stream.ID, snapshot); err != nil {
			p.log.Warn("metadata poller: disable metadata resolver failed", "stream_id", stream.ID, "error", err)
		}
	}
	// Persist newly-discovered detection hint (source, metadata_url) back to
	// the editorial row so future cold reads can pick the right strategy fast.
	if np.Source != "" || np.MetadataURL != "" {
		src := optionalString(np.Source)
		url := optionalString(np.MetadataURL)
		delayed := ev.DelayedICY
		if err := p.streams.UpdateMetadataDetection(persistCtx, stream.ID, src, url, &delayed); err != nil {
			p.log.Warn("metadata poller: update detection failed", "stream_id", stream.ID, "error", err)
		}
	}

	out := snapshotFromNowPlaying(np)
	return &out, nil
}

func (p *MetadataPoller) acquireFetchSlot(ctx context.Context) (func(), bool) {
	select {
	case p.fetchSlots <- struct{}{}:
		return func() { <-p.fetchSlots }, true
	case <-ctx.Done():
		return nil, false
	}
}

func isNoMetadataSnapshot(snap *Snapshot) bool {
	return snap != nil && snap.ErrorCode == metadata.ErrorCodeNoMeta
}

func (p *MetadataPoller) metadataResolverSnapshotAfterNoMetadata(
	ctx context.Context,
	stream *store.StationStream,
	checkedAt time.Time,
	delayed bool,
) store.MetadataResolverSnapshot {
	snapshot := store.MetadataResolverSnapshot{
		Resolver:  metadata.ResolverNone,
		CheckedAt: &checkedAt,
		Delayed:   &delayed,
	}
	if stream == nil || !stream.MetadataEnabled {
		return snapshot
	}

	streamURL := strings.TrimSpace(stream.ResolvedURL)
	if streamURL == "" {
		streamURL = strings.TrimSpace(stream.URL)
	}
	if streamURL == "" {
		return snapshot
	}

	clientMetadata := radio.ProbeClientMetadataSupport(
		ctx,
		p.client,
		p.origins,
		streamURL,
		stringValue(stream.MetadataURL),
		stream.Kind,
		stream.Container,
		stream.MetadataEnabled,
		stream.MetadataType,
	)
	if clientMetadata.Supported {
		snapshot.Resolver = metadata.ResolverClient
		snapshot.MetadataURL = optionalString(clientMetadata.MetadataURL)
	}
	return snapshot
}

func (p *MetadataPoller) broadcast(ch *pollerChannel, snap Snapshot) {
	p.mu.Lock()
	defer p.mu.Unlock()
	ch.last = &snap
	for sub := range ch.subscribers {
		select {
		case sub <- snap:
		default:
			// Slow consumer — drop this update. SSE writer will recover on
			// the next event or reconnect.
		}
	}
}

func snapshotFromNowPlaying(np *metadata.NowPlaying) Snapshot {
	if np == nil {
		return Snapshot{Status: "error", FetchedAt: time.Now().UTC()}
	}
	return Snapshot{
		Title:       np.Title,
		Artist:      np.Artist,
		Song:        np.Song,
		Source:      np.Source,
		MetadataURL: np.MetadataURL,
		Supported:   np.Supported,
		Status:      np.Status,
		ErrorCode:   np.ErrorCode,
		Error:       np.Error,
		FetchedAt:   np.FetchedAt,
	}
}

func snapshotFromStore(np *store.StreamNowPlaying) Snapshot {
	if np == nil {
		return Snapshot{Status: "unsupported", FetchedAt: time.Now().UTC()}
	}
	out := Snapshot{
		Title:     np.Title,
		Artist:    np.Artist,
		Song:      np.Song,
		Source:    np.Source,
		FetchedAt: np.FetchedAt,
	}
	if np.MetadataURL != nil {
		out.MetadataURL = *np.MetadataURL
	}
	if np.Error != nil {
		out.Error = *np.Error
	}
	if np.ErrorCode != nil {
		out.ErrorCode = *np.ErrorCode
	}
	if strings.TrimSpace(np.Title) != "" {
		out.Supported = true
		out.Status = "ok"
	} else if out.ErrorCode != "" && out.ErrorCode != metadata.ErrorCodeNoMeta {
		out.Status = "error"
	} else {
		out.Status = "unsupported"
	}
	return out
}

func optionalString(v string) *string {
	trimmed := strings.TrimSpace(v)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func stringValue(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}
