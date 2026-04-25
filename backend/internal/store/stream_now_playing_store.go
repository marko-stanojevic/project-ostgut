package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StreamNowPlaying is the live snapshot of what is currently playing on a stream.
// It lives in its own table to isolate the high-churn write path from the
// editorial station_streams row.
type StreamNowPlaying struct {
	StreamID    string
	Title       string
	Artist      string
	Song        string
	Source      string  // icy | icecast | shoutcast | id3 | ""
	MetadataURL *string // exact endpoint that produced this snapshot
	Error       *string
	ErrorCode   *string
	FetchedAt   time.Time
	UpdatedAt   time.Time
}

// StreamNowPlayingStore reads and writes the live now-playing snapshot.
type StreamNowPlayingStore struct {
	pool *pgxpool.Pool
}

func NewStreamNowPlayingStore(pool *pgxpool.Pool) *StreamNowPlayingStore {
	return &StreamNowPlayingStore{pool: pool}
}

// Get returns the snapshot for streamID, or ErrNotFound if there is none yet.
func (s *StreamNowPlayingStore) Get(ctx context.Context, streamID string) (*StreamNowPlaying, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT stream_id, title, artist, song, source, metadata_url,
		       error, error_code, fetched_at, updated_at
		FROM stream_now_playing
		WHERE stream_id = $1`, streamID)

	var np StreamNowPlaying
	if err := row.Scan(
		&np.StreamID,
		&np.Title,
		&np.Artist,
		&np.Song,
		&np.Source,
		&np.MetadataURL,
		&np.Error,
		&np.ErrorCode,
		&np.FetchedAt,
		&np.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get stream now playing: %w", err)
	}
	return &np, nil
}

// ListByStreamIDs returns a stream_id => snapshot map for the requested streams.
func (s *StreamNowPlayingStore) ListByStreamIDs(ctx context.Context, streamIDs []string) (map[string]*StreamNowPlaying, error) {
	result := make(map[string]*StreamNowPlaying, len(streamIDs))
	if len(streamIDs) == 0 {
		return result, nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT stream_id, title, artist, song, source, metadata_url,
		       error, error_code, fetched_at, updated_at
		FROM stream_now_playing
		WHERE stream_id = ANY($1::uuid[])`, streamIDs)
	if err != nil {
		return nil, fmt.Errorf("list stream now playing: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var np StreamNowPlaying
		if err := rows.Scan(
			&np.StreamID,
			&np.Title,
			&np.Artist,
			&np.Song,
			&np.Source,
			&np.MetadataURL,
			&np.Error,
			&np.ErrorCode,
			&np.FetchedAt,
			&np.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan stream now playing: %w", err)
		}
		copy := np
		result[np.StreamID] = &copy
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// Upsert writes a fresh snapshot. Conflict-free: always overwrites.
func (s *StreamNowPlayingStore) Upsert(ctx context.Context, snapshot StreamNowPlaying) error {
	if strings.TrimSpace(snapshot.StreamID) == "" {
		return fmt.Errorf("stream id required")
	}
	if snapshot.FetchedAt.IsZero() {
		snapshot.FetchedAt = time.Now().UTC()
	}

	_, err := s.pool.Exec(ctx, `
		INSERT INTO stream_now_playing (
			stream_id, title, artist, song, source, metadata_url,
			error, error_code, fetched_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (stream_id) DO UPDATE SET
			title = EXCLUDED.title,
			artist = EXCLUDED.artist,
			song = EXCLUDED.song,
			source = EXCLUDED.source,
			metadata_url = EXCLUDED.metadata_url,
			error = EXCLUDED.error,
			error_code = EXCLUDED.error_code,
			fetched_at = EXCLUDED.fetched_at,
			updated_at = NOW()`,
		snapshot.StreamID,
		strings.TrimSpace(snapshot.Title),
		strings.TrimSpace(snapshot.Artist),
		strings.TrimSpace(snapshot.Song),
		strings.TrimSpace(snapshot.Source),
		snapshot.MetadataURL,
		snapshot.Error,
		snapshot.ErrorCode,
		snapshot.FetchedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert stream now playing: %w", err)
	}
	return nil
}
