package handler

import (
	"context"
	"log/slog"
	"time"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

const mediaCleanerInterval = 10 * time.Minute

// MediaCleaner periodically hard-deletes expired pending media asset rows and
// their uploaded blobs. It runs on a fixed cadence; there is no manual trigger
// because the expiry window is short enough that the next tick is always fast.
type MediaCleaner struct {
	assets     *store.MediaAssetStore
	deleteBlob func(ctx context.Context, objectKey string) error
	log        *slog.Logger
}

func newMediaCleaner(
	assets *store.MediaAssetStore,
	deleteBlob func(context.Context, string) error,
	log *slog.Logger,
) *MediaCleaner {
	return &MediaCleaner{assets: assets, deleteBlob: deleteBlob, log: log}
}

// Run blocks, cleaning expired pending assets on mediaCleanerInterval.
func (c *MediaCleaner) Run(ctx context.Context) {
	ticker := time.NewTicker(mediaCleanerInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.runOnce(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (c *MediaCleaner) runOnce(ctx context.Context) {
	expired, err := c.assets.DeleteExpiredPending(ctx)
	if err != nil {
		c.log.Error("media cleaner: delete expired pending", "error", err)
		return
	}
	if len(expired) == 0 {
		return
	}

	c.log.Info("media cleaner: removed expired pending assets", "count", len(expired))

	for _, asset := range expired {
		if asset.StorageKeyOriginal == "" {
			continue
		}
		if err := c.deleteBlob(ctx, asset.StorageKeyOriginal); err != nil {
			c.log.Error("media cleaner: delete blob", "asset_id", asset.ID, "key", asset.StorageKeyOriginal, "error", err)
		}
	}
}
