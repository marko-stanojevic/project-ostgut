package store_test

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// TestMediaAssetStore_ClaimExpiredPending_RetainsRetryHandle asserts the cleanup
// contract for expired pending uploads: the cleaner claims rows first, upload
// completion is blocked while claimed, failed cleanup can release the claim for
// retry, and final deletion removes only claimed pending rows.
//
// Requires a Postgres test database with all migrations applied. Set
// TEST_DATABASE_URL to opt in. Skipped otherwise.
func TestMediaAssetStore_ClaimExpiredPending_RetainsRetryHandle(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	assets := store.NewMediaAssetStore(pool)
	ownerID := uuid.NewString()

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM media_assets WHERE owner_id = $1`, ownerID)
	})

	asset, err := assets.CreatePending(ctx, store.CreateMediaAssetParams{
		OwnerType:          store.MediaAssetOwnerUser,
		OwnerID:            ownerID,
		Kind:               store.MediaAssetKindAvatar,
		StorageKeyOriginal: "test/original.png",
		MIMEType:           "image/png",
	})
	if err != nil {
		t.Fatalf("create pending asset: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE media_assets SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, asset.ID); err != nil {
		t.Fatalf("expire asset: %v", err)
	}

	claimed, err := assets.ClaimExpiredPending(ctx, 10)
	if err != nil {
		t.Fatalf("claim expired pending assets: %v", err)
	}
	if len(claimed) != 1 || claimed[0].ID != asset.ID {
		t.Fatalf("expected claimed asset %s, got %#v", asset.ID, claimed)
	}

	err = assets.MarkReady(ctx, asset.ID, store.MarkMediaAssetReadyParams{
		Variants: map[string]string{"original": "test/original.png"},
		MIMEType: "image/png",
		Width:    100,
		Height:   100,
		ByteSize: 1234,
	})
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected MarkReady on claimed asset to return ErrNotFound, got: %v", err)
	}

	if err := assets.ReleaseCleanupClaim(ctx, asset.ID); err != nil {
		t.Fatalf("release cleanup claim: %v", err)
	}
	if err := assets.MarkReady(ctx, asset.ID, store.MarkMediaAssetReadyParams{
		Variants: map[string]string{"original": "test/original.png"},
		MIMEType: "image/png",
		Width:    100,
		Height:   100,
		ByteSize: 1234,
	}); err != nil {
		t.Fatalf("mark ready after releasing claim: %v", err)
	}

	secondAsset, err := assets.CreatePending(ctx, store.CreateMediaAssetParams{
		OwnerType:          store.MediaAssetOwnerUser,
		OwnerID:            ownerID,
		Kind:               store.MediaAssetKindAvatar,
		StorageKeyOriginal: "test/original-2.png",
		MIMEType:           "image/png",
	})
	if err != nil {
		t.Fatalf("create second pending asset: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE media_assets SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, secondAsset.ID); err != nil {
		t.Fatalf("expire second asset: %v", err)
	}
	secondClaimed, err := assets.ClaimExpiredPending(ctx, 10)
	if err != nil {
		t.Fatalf("claim second expired asset: %v", err)
	}
	if len(secondClaimed) != 1 || secondClaimed[0].ID != secondAsset.ID {
		t.Fatalf("expected second claimed asset %s, got %#v", secondAsset.ID, secondClaimed)
	}
	if err := assets.DeleteClaimedPending(ctx, secondAsset.ID); err != nil {
		t.Fatalf("delete claimed pending asset: %v", err)
	}
	if _, err := assets.GetByID(ctx, secondAsset.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected deleted claimed asset to be gone, got: %v", err)
	}
}
