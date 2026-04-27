package db

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PoolMetricRecorder interface {
	RecordCustomMetric(name string, value float64)
}

// StartPoolStatsReporter records pgxpool pressure and wait-time metrics.
func StartPoolStatsReporter(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger, interval time.Duration, recorder PoolMetricRecorder) {
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
				recordPoolStats(recorder, previous, current)
				logger.Debug(
					"database pool stats",
					"acquired_conns", current.AcquiredConns(),
					"idle_conns", current.IdleConns(),
					"total_conns", current.TotalConns(),
					"max_conns", current.MaxConns(),
					"constructing_conns", current.ConstructingConns(),
					"empty_acquire_count", current.EmptyAcquireCount(),
					"canceled_acquire_count", current.CanceledAcquireCount(),
				)
				previous = current
			}
		}
	}()
}

func recordPoolStats(recorder PoolMetricRecorder, previous, current *pgxpool.Stat) {
	if recorder == nil || current == nil {
		return
	}

	recorder.RecordCustomMetric("Custom/Postgres/Pool/AcquiredConns", float64(current.AcquiredConns()))
	recorder.RecordCustomMetric("Custom/Postgres/Pool/IdleConns", float64(current.IdleConns()))
	recorder.RecordCustomMetric("Custom/Postgres/Pool/TotalConns", float64(current.TotalConns()))
	recorder.RecordCustomMetric("Custom/Postgres/Pool/MaxConns", float64(current.MaxConns()))
	recorder.RecordCustomMetric("Custom/Postgres/Pool/ConstructingConns", float64(current.ConstructingConns()))
	recorder.RecordCustomMetric("Custom/Postgres/Pool/CanceledAcquireCount", float64(current.CanceledAcquireCount()))
	recorder.RecordCustomMetric("Custom/Postgres/Pool/EmptyAcquireCount", float64(current.EmptyAcquireCount()))

	if previous == nil {
		return
	}

	acquireDelta := current.AcquireCount() - previous.AcquireCount()
	if acquireDelta > 0 {
		waitDelta := current.AcquireDuration() - previous.AcquireDuration()
		recorder.RecordCustomMetric("Custom/Postgres/Pool/AcquireWaitMilliseconds", float64(waitDelta.Milliseconds())/float64(acquireDelta))
	}

	emptyAcquireDelta := current.EmptyAcquireCount() - previous.EmptyAcquireCount()
	if emptyAcquireDelta > 0 {
		waitDelta := current.EmptyAcquireWaitTime() - previous.EmptyAcquireWaitTime()
		recorder.RecordCustomMetric("Custom/Postgres/Pool/EmptyAcquireWaitMilliseconds", float64(waitDelta.Milliseconds())/float64(emptyAcquireDelta))
	}
}
