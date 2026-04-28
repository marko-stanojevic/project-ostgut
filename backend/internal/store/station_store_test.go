package store_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

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

// TestStationStreamStore_ListDueActiveForApprovedStations_ScopesRecurringProbe
// asserts the recurring prober workload contract: only active streams belonging
// to active, approved stations whose next_probe_at has arrived are eligible for
// scheduled/manual job re-probes.
// Pending and rejected stations may still be probed manually from the editor.
//
// Requires a Postgres test database with all migrations applied. Set
// TEST_DATABASE_URL to opt in. Skipped otherwise.
func TestStationStreamStore_ListDueActiveForApprovedStations_ScopesRecurringProbe(t *testing.T) {
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

	stations := store.NewStationStore(pool)
	streams := store.NewStationStreamStore(pool)

	base := fmt.Sprintf("ostgut-test-probe-scope-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%"); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%")
	})

	approvedActive := createStationWithStream(t, ctx, stations, streams, base, "approved-active", "approved", true)
	approvedInactive := createStationWithStream(t, ctx, stations, streams, base, "approved-inactive", "approved", false)
	pendingActive := createStationWithStream(t, ctx, stations, streams, base, "pending-active", "pending", true)
	rejectedActive := createStationWithStream(t, ctx, stations, streams, base, "rejected-active", "rejected", true)
	approvedFuture := createStationWithStream(t, ctx, stations, streams, base, "approved-future", "approved", true)
	if _, err := pool.Exec(ctx, `UPDATE station_streams SET next_probe_at = NOW() + INTERVAL '1 hour' WHERE station_id = $1`, approvedFuture); err != nil {
		t.Fatalf("set future next_probe_at: %v", err)
	}

	eligible, err := streams.ListDueActiveForApprovedStations(ctx, time.Now().UTC(), 100)
	if err != nil {
		t.Fatalf("list eligible streams: %v", err)
	}

	found := map[string]bool{}
	for _, stream := range eligible {
		switch stream.StationID {
		case approvedActive, approvedInactive, pendingActive, rejectedActive, approvedFuture:
			found[stream.StationID] = true
		}
	}

	if !found[approvedActive] {
		t.Fatal("expected approved active stream to be eligible for recurring probe")
	}
	if found[approvedInactive] {
		t.Fatal("did not expect inactive stream on approved station to be eligible for recurring probe")
	}
	if found[pendingActive] {
		t.Fatal("did not expect active stream on pending station to be eligible for recurring probe")
	}
	if found[rejectedActive] {
		t.Fatal("did not expect active stream on rejected station to be eligible for recurring probe")
	}
	if found[approvedFuture] {
		t.Fatal("did not expect approved active stream with future next_probe_at to be eligible for recurring probe")
	}
}

// TestStationStreamStore_ListActiveForApprovedStations_ScopesMetadataCoverageJob
// asserts the explicit metadata coverage job only enumerates approved active
// streams, including legacy rows whose persisted metadata flag is stale.
//
// Requires a Postgres test database with all migrations applied. Set
// TEST_DATABASE_URL to opt in. Skipped otherwise.
func TestStationStreamStore_ListActiveForApprovedStations_ScopesMetadataCoverageJob(t *testing.T) {
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

	stations := store.NewStationStore(pool)
	streams := store.NewStationStreamStore(pool)

	base := fmt.Sprintf("ostgut-test-metadata-scope-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%"); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%")
	})

	approvedDisabled := createStationWithStream(t, ctx, stations, streams, base, "approved-disabled", "approved", true)
	pendingActive := createStationWithStream(t, ctx, stations, streams, base, "pending-active", "pending", true)
	rejectedActive := createStationWithStream(t, ctx, stations, streams, base, "rejected-active", "rejected", true)
	approvedInactive := createStationWithStream(t, ctx, stations, streams, base, "approved-inactive", "approved", false)

	eligible, err := streams.ListActiveForApprovedStations(ctx)
	if err != nil {
		t.Fatalf("list approved metadata coverage streams: %v", err)
	}

	found := map[string]bool{}
	for _, stream := range eligible {
		switch stream.StationID {
		case approvedDisabled, pendingActive, rejectedActive, approvedInactive:
			found[stream.StationID] = true
		}
	}

	if !found[approvedDisabled] {
		t.Fatal("expected approved active stream with stale metadata flag to be eligible for metadata coverage")
	}
	if found[pendingActive] {
		t.Fatal("did not expect pending active stream to be eligible for metadata coverage")
	}
	if found[rejectedActive] {
		t.Fatal("did not expect rejected active stream to be eligible for metadata coverage")
	}
	if found[approvedInactive] {
		t.Fatal("did not expect inactive stream on approved station to be eligible for metadata coverage")
	}
}

// TestStationStreamStore_ListActiveForApprovedStations_IncludesApprovedFutureProbe
// asserts manual approved-catalog maintenance can enumerate approved active
// streams even when their next scheduled probe is still in the future.
//
// Requires a Postgres test database with all migrations applied. Set
// TEST_DATABASE_URL to opt in. Skipped otherwise.
func TestStationStreamStore_ListActiveForApprovedStations_IncludesApprovedFutureProbe(t *testing.T) {
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

	stations := store.NewStationStore(pool)
	streams := store.NewStationStreamStore(pool)

	base := fmt.Sprintf("ostgut-test-approved-future-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%"); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%")
	})

	approvedFuture := createStationWithStream(t, ctx, stations, streams, base, "approved-future", "approved", true)
	if _, err := pool.Exec(ctx, `UPDATE station_streams SET next_probe_at = NOW() + INTERVAL '1 hour' WHERE station_id = $1`, approvedFuture); err != nil {
		t.Fatalf("set future next_probe_at: %v", err)
	}

	eligible, err := streams.ListActiveForApprovedStations(ctx)
	if err != nil {
		t.Fatalf("list approved streams: %v", err)
	}

	found := false
	for _, stream := range eligible {
		if stream.StationID == approvedFuture {
			found = true
			break
		}
	}

	if !found {
		t.Fatal("expected approved active stream with future next_probe_at to be eligible for manual re-probe")
	}
}

// TestStationStreamStore_UpsertPrimaryForStationPreservesDiagnosticsWhenURLUnchanged
// asserts station sync light classification does not wipe metadata/probe evidence
// for an unchanged canonical URL.
//
// Requires a Postgres test database with all migrations applied. Set
// TEST_DATABASE_URL to opt in. Skipped otherwise.
func TestStationStreamStore_UpsertPrimaryForStationPreservesDiagnosticsWhenURLUnchanged(t *testing.T) {
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

	stations := store.NewStationStore(pool)
	streams := store.NewStationStreamStore(pool)

	base := fmt.Sprintf("ostgut-test-sync-preserve-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%"); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM stations WHERE name LIKE $1`, base+"%")
	})

	station, err := stations.CreateManual(ctx, store.ManualStationInput{
		Name:   base + "-station",
		Status: "approved",
	})
	if err != nil {
		t.Fatalf("create station: %v", err)
	}

	checkedAt := time.Now().UTC().Add(-15 * time.Minute).Round(time.Second)
	metadataURL := "https://example.com/status-json.xsl"
	lastErrorCode := "request_failed"
	if _, err := streams.ReplaceForStation(ctx, station.ID, []store.StationStreamInput{{
		URL:                       "https://example.com/stream.mp3",
		ResolvedURL:               "https://example.com/stream.mp3",
		Kind:                      "direct",
		Container:                 "none",
		Transport:                 "https",
		MimeType:                  "audio/mpeg",
		Codec:                     "MP3",
		Bitrate:                   128,
		Priority:                  1,
		IsActive:                  true,
		MetadataMode:              "auto",
		MetadataType:              "auto",
		MetadataURL:               &metadataURL,
		MetadataResolver:          "client",
		MetadataResolverCheckedAt: &checkedAt,
		NextProbeAt:               &checkedAt,
		LastCheckedAt:             &checkedAt,
		LastErrorCode:             lastErrorCode,
	}}); err != nil {
		t.Fatalf("replace streams: %v", err)
	}

	if err := streams.UpsertPrimaryForStation(ctx, station.ID, store.StationStreamInput{
		URL:         "https://example.com/stream.mp3",
		ResolvedURL: "https://example.com/stream.mp3",
		Kind:        "direct",
		Container:   "none",
		Transport:   "https",
		Codec:       "MP3",
		Priority:    1,
		IsActive:    true,
		HealthScore: 0.9,
	}); err != nil {
		t.Fatalf("upsert primary stream: %v", err)
	}

	got, err := streams.ListByStationID(ctx, station.ID)
	if err != nil {
		t.Fatalf("list streams: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected one stream, got %d", len(got))
	}
	if got[0].MetadataMode != "auto" {
		t.Fatalf("expected metadata mode to be preserved when url is unchanged, got %q", got[0].MetadataMode)
	}
	if got[0].MetadataResolver != "client" {
		t.Fatalf("expected metadata resolver to be preserved, got %q", got[0].MetadataResolver)
	}
	if got[0].MetadataURL == nil || *got[0].MetadataURL != metadataURL {
		t.Fatalf("expected metadata url to be preserved, got %#v", got[0].MetadataURL)
	}
	if got[0].LastCheckedAt == nil || !got[0].LastCheckedAt.UTC().Equal(checkedAt) {
		t.Fatalf("expected last_checked_at to be preserved, got %#v", got[0].LastCheckedAt)
	}
	if got[0].LastErrorCode != lastErrorCode {
		t.Fatalf("expected last probe error code to be preserved, got %q", got[0].LastErrorCode)
	}
}

func createStationWithStream(
	t *testing.T,
	ctx context.Context,
	stations *store.StationStore,
	streams *store.StationStreamStore,
	base string,
	suffix string,
	status string,
	streamActive bool,
) string {
	t.Helper()

	station, err := stations.CreateManual(ctx, store.ManualStationInput{
		Name:   base + "-" + suffix,
		Status: status,
	})
	if err != nil {
		t.Fatalf("create %s station: %v", suffix, err)
	}

	_, err = streams.ReplaceForStation(ctx, station.ID, []store.StationStreamInput{
		{
			URL:       "https://example.com/" + base + "/" + suffix + ".mp3",
			Priority:  1,
			IsActive:  streamActive,
			Bitrate:   128,
			Codec:     "MP3",
			Kind:      "direct",
			Container: "none",
			Transport: "https",
		},
	})
	if err != nil {
		t.Fatalf("replace %s streams: %v", suffix, err)
	}

	return station.ID
}
