package db

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// StartPoolStatsReporter records pgxpool pressure and wait-time metrics.
func StartPoolStatsReporter(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger, interval time.Duration) {
	if pool == nil || interval <= 0 {
		return
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		previous := pool.Stat()
		logger.Info("database pool observability started", "interval", interval.String())

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				current := pool.Stat()
				logger.Info(
					"database pool stats",
					"event", "database_pool_stats_recorded",
					"acquired_conns", current.AcquiredConns(),
					"idle_conns", current.IdleConns(),
					"total_conns", current.TotalConns(),
					"max_conns", current.MaxConns(),
					"constructing_conns", current.ConstructingConns(),
					"empty_acquire_count", current.EmptyAcquireCount(),
					"canceled_acquire_count", current.CanceledAcquireCount(),
					"acquire_wait_ms", averageAcquireWaitMillis(previous, current),
					"empty_acquire_wait_ms", averageEmptyAcquireWaitMillis(previous, current),
				)
				previous = current
			}
		}
	}()
}

func averageAcquireWaitMillis(previous, current *pgxpool.Stat) float64 {
	if previous == nil {
		return 0
	}

	acquireDelta := current.AcquireCount() - previous.AcquireCount()
	if acquireDelta > 0 {
		waitDelta := current.AcquireDuration() - previous.AcquireDuration()
		return float64(waitDelta.Milliseconds()) / float64(acquireDelta)
	}
	return 0
}

func averageEmptyAcquireWaitMillis(previous, current *pgxpool.Stat) float64 {
	if previous == nil {
		return 0
	}

	emptyAcquireDelta := current.EmptyAcquireCount() - previous.EmptyAcquireCount()
	if emptyAcquireDelta > 0 {
		waitDelta := current.EmptyAcquireWaitTime() - previous.EmptyAcquireWaitTime()
		return float64(waitDelta.Milliseconds()) / float64(emptyAcquireDelta)
	}
	return 0
}
