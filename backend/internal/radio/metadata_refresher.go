package radio

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/metadata"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
	"golang.org/x/sync/singleflight"
)

const (
	metadataRefreshSupportedTTL   = 30 * time.Second
	metadataRefreshUnsupportedTTL = 3 * time.Minute
	metadataRefreshTimeout        = 22 * time.Second
)

// MetadataRefresher updates stored now-playing snapshots without blocking
// player-facing HTTP reads.
type MetadataRefresher struct {
	streams *store.StationStreamStore
	fetcher *metadata.Fetcher
	log     *slog.Logger
	group   singleflight.Group
}

func NewMetadataRefresher(streams *store.StationStreamStore, fetcher *metadata.Fetcher, log *slog.Logger) *MetadataRefresher {
	return &MetadataRefresher{
		streams: streams,
		fetcher: fetcher,
		log:     log,
	}
}

func (r *MetadataRefresher) NeedsRefresh(stream *store.StationStream) bool {
	if stream == nil || !stream.MetadataEnabled {
		return false
	}

	lastFetchedAt := stream.MetadataLastFetchedAt
	if lastFetchedAt == nil || lastFetchedAt.IsZero() {
		return true
	}

	ttl := metadataRefreshUnsupportedTTL
	if strings.TrimSpace(stream.NowPlayingTitle) != "" {
		ttl = metadataRefreshSupportedTTL
	}

	return time.Since(*lastFetchedAt) >= ttl
}

func (r *MetadataRefresher) RefreshAsync(stream *store.StationStream) {
	if stream == nil || !stream.MetadataEnabled {
		return
	}

	go func(snapshot *store.StationStream) {
		_, _, _ = r.group.Do(snapshot.ID, func() (any, error) {
			ctx, cancel := context.WithTimeout(context.Background(), metadataRefreshTimeout)
			defer cancel()

			streamURL := strings.TrimSpace(snapshot.ResolvedURL)
			if streamURL == "" {
				streamURL = strings.TrimSpace(snapshot.URL)
			}
			if streamURL == "" {
				return nil, nil
			}

			np := r.fetcher.Fetch(ctx, streamURL, metadata.Config{
				Enabled:     true,
				Type:        snapshot.MetadataType,
				SourceHint:  stringValue(snapshot.MetadataSource),
				MetadataURL: stringValue(snapshot.MetadataURL),
			})

			if err := r.streams.UpdateNowPlayingSnapshot(ctx, snapshot.ID, store.NowPlayingSnapshot{
				Title:                 np.Title,
				Artist:                np.Artist,
				Song:                  np.Song,
				MetadataSource:        normalizeMetadataValue(np.Source),
				MetadataURL:           normalizeMetadataValue(np.MetadataURL),
				MetadataError:         normalizeMetadataValue(np.Error),
				MetadataErrorCode:     normalizeMetadataValue(np.ErrorCode),
				MetadataLastFetchedAt: normalizeFetchedAt(np.FetchedAt),
			}); err != nil {
				r.log.Warn("metadata refresher: update failed", "stream_id", snapshot.ID, "error", err)
			}
			return nil, nil
		})
	}(stream)
}

func normalizeMetadataValue(raw string) *string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeFetchedAt(v time.Time) *time.Time {
	if v.IsZero() {
		return nil
	}
	return &v
}

func stringValue(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}
