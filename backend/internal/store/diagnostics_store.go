package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DatabaseDiagnostics captures live database and pool state for admin diagnostics.
type DatabaseDiagnostics struct {
	DatabaseName        string
	DatabaseUser        string
	ServerVersion       string
	ServerStartedAt     time.Time
	MigrationVersion    int
	MigrationDirty      bool
	PingDuration        time.Duration
	AcquiredConnections int32
	IdleConnections     int32
	TotalConnections    int32
	MaxConnections      int32
	ConstructingConns   int32
	AcquireCount        int64
	CanceledAcquire     int64
	EmptyAcquire        int64
	AcquireDuration     time.Duration
	EmptyAcquireWait    time.Duration
}

// DiagnosticsStore owns low-level database diagnostics for admin-only views.
type DiagnosticsStore struct {
	pool *pgxpool.Pool
}

// NewDiagnosticsStore creates a DiagnosticsStore backed by the given pool.
func NewDiagnosticsStore(pool *pgxpool.Pool) *DiagnosticsStore {
	return &DiagnosticsStore{pool: pool}
}

// Database returns live database and connection-pool diagnostics.
func (s *DiagnosticsStore) Database(ctx context.Context) (*DatabaseDiagnostics, error) {
	started := time.Now()
	if err := s.pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}
	pingDuration := time.Since(started)

	var diagnostics DatabaseDiagnostics
	err := s.pool.QueryRow(ctx, `
		SELECT current_database(), current_user, version(), pg_postmaster_start_time()`,
	).Scan(&diagnostics.DatabaseName, &diagnostics.DatabaseUser, &diagnostics.ServerVersion, &diagnostics.ServerStartedAt)
	if err != nil {
		return nil, fmt.Errorf("read database diagnostics: %w", err)
	}

	err = s.pool.QueryRow(ctx, `SELECT version, dirty FROM schema_migrations LIMIT 1`).Scan(&diagnostics.MigrationVersion, &diagnostics.MigrationDirty)
	if err != nil {
		return nil, fmt.Errorf("read migration diagnostics: %w", err)
	}

	stats := s.pool.Stat()
	diagnostics.PingDuration = pingDuration
	diagnostics.AcquiredConnections = stats.AcquiredConns()
	diagnostics.IdleConnections = stats.IdleConns()
	diagnostics.TotalConnections = stats.TotalConns()
	diagnostics.MaxConnections = stats.MaxConns()
	diagnostics.ConstructingConns = stats.ConstructingConns()
	diagnostics.AcquireCount = stats.AcquireCount()
	diagnostics.CanceledAcquire = stats.CanceledAcquireCount()
	diagnostics.EmptyAcquire = stats.EmptyAcquireCount()
	diagnostics.AcquireDuration = stats.AcquireDuration()
	diagnostics.EmptyAcquireWait = stats.EmptyAcquireWaitTime()

	return &diagnostics, nil
}
