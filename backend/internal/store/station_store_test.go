package store_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// TestStationStore_DuplicateApprovedName_RejectedByDB asserts the contract
// that two approved+active stations cannot share a normalized name. The
// guarantee is enforced by the partial unique index
// stations_approved_name_idx (migration 032). The store maps the resulting
// pgx error to ErrDuplicateStationName so callers can branch with
// errors.Is.
//
// This is the regression test for the bug class fixed in migration 032:
// before the index existed, the previous design allowed BulkUpdateStatus,
// CreateManual, UpdateEnrichment and UpdateEnrichmentAndStreams to all
// silently produce duplicate approved names.
//
// Requires a Postgres test database with all migrations applied. Set
// TEST_DATABASE_URL to opt in. Skipped otherwise.
func TestStationStore_DuplicateApprovedName_RejectedByDB(t *testing.T) {
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

	st := store.NewStationStore(pool)

	// Use a name unique enough that local data cannot interfere.
	base := "ostgut-test-duplicate-approved-name"

	// Cleanup any prior test rows.
	if _, err := pool.Exec(ctx, `DELETE FROM stations WHERE lower(btrim(name)) = $1`, base); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM stations WHERE lower(btrim(name)) = $1`, base)
	})

	first, err := st.CreateManual(ctx, store.ManualStationInput{
		Name:   base,
		Status: "approved",
	})
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	if first == nil {
		t.Fatal("first create returned nil station")
	}

	// Case- and whitespace-variation must collide.
	collidingName := "  " + strings.ToUpper(base) + " "

	_, err = st.CreateManual(ctx, store.ManualStationInput{
		Name:   collidingName,
		Status: "approved",
	})
	if !errors.Is(err, store.ErrDuplicateStationName) {
		t.Fatalf("expected ErrDuplicateStationName on duplicate approved create, got: %v", err)
	}

	// A second pending row with the same name is allowed (partial index).
	pending, err := st.CreateManual(ctx, store.ManualStationInput{
		Name:   collidingName,
		Status: "pending",
	})
	if err != nil {
		t.Fatalf("pending create with same name should be allowed: %v", err)
	}

	// Bulk-approving the pending row must surface the same typed error.
	_, err = st.BulkUpdateStatus(ctx, []string{pending.ID}, "approved")
	if !errors.Is(err, store.ErrDuplicateStationName) {
		t.Fatalf("expected ErrDuplicateStationName on bulk approve collision, got: %v", err)
	}
}
