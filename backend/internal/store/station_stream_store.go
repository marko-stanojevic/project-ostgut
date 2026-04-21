package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// StationStream represents one playable variant for a station.
type StationStream struct {
	ID            string
	StationID     string
	URL           string
	ResolvedURL   string
	Kind          string // direct | playlist | hls
	Container     string // none | m3u | m3u8 | pls
	Transport     string // http | https | icy | shoutcast | icecast
	MimeType      string
	Codec         string
	Bitrate       int
	BitDepth      int
	SampleRateHz  int
	Channels      int
	Priority      int
	IsActive      bool
	HealthScore   float64
	LastCheckedAt *time.Time
	LastError     *string
}

// StationStreamInput is the write payload for station stream variants.
type StationStreamInput struct {
	URL           string
	ResolvedURL   string
	Kind          string
	Container     string
	Transport     string
	MimeType      string
	Codec         string
	Bitrate       int
	BitDepth      int
	SampleRateHz  int
	Channels      int
	Priority      int
	IsActive      bool
	HealthScore   float64
	LastCheckedAt *time.Time
	LastError     *string
}

// StationStreamStore executes queries against station_streams.
type StationStreamStore struct {
	pool *pgxpool.Pool
}

func NewStationStreamStore(pool *pgxpool.Pool) *StationStreamStore {
	return &StationStreamStore{pool: pool}
}

func scanStationStreamRow(row Scanner) (*StationStream, error) {
	var s StationStream
	if err := row.Scan(
		&s.ID,
		&s.StationID,
		&s.URL,
		&s.ResolvedURL,
		&s.Kind,
		&s.Container,
		&s.Transport,
		&s.MimeType,
		&s.Codec,
		&s.Bitrate,
		&s.BitDepth,
		&s.SampleRateHz,
		&s.Channels,
		&s.Priority,
		&s.IsActive,
		&s.HealthScore,
		&s.LastCheckedAt,
		&s.LastError,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

// Scanner is the small shared interface for pgx row scanning.
type Scanner interface {
	Scan(dest ...any) error
}

func sanitizeStreamInput(in StationStreamInput, fallbackPriority int) StationStreamInput {
	url := strings.TrimSpace(in.URL)
	resolved := strings.TrimSpace(in.ResolvedURL)
	if resolved == "" {
		resolved = url
	}
	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	switch kind {
	case "direct", "playlist", "hls":
	default:
		kind = "direct"
	}

	container := strings.ToLower(strings.TrimSpace(in.Container))
	switch container {
	case "none", "m3u", "m3u8", "pls":
	default:
		container = "none"
	}

	transport := strings.ToLower(strings.TrimSpace(in.Transport))
	switch transport {
	case "http", "https", "icy", "shoutcast", "icecast":
	default:
		transport = "http"
	}

	priority := in.Priority
	if priority <= 0 {
		priority = fallbackPriority
	}

	health := in.HealthScore
	if health < 0 {
		health = 0
	}
	if health > 1 {
		health = 1
	}

	return StationStreamInput{
		URL:           url,
		ResolvedURL:   resolved,
		Kind:          kind,
		Container:     container,
		Transport:     transport,
		MimeType:      strings.TrimSpace(in.MimeType),
		Codec:         strings.ToUpper(strings.TrimSpace(in.Codec)),
		Bitrate:       in.Bitrate,
		BitDepth:      in.BitDepth,
		SampleRateHz:  in.SampleRateHz,
		Channels:      in.Channels,
		Priority:      priority,
		IsActive:      in.IsActive,
		HealthScore:   health,
		LastCheckedAt: in.LastCheckedAt,
		LastError:     in.LastError,
	}
}

// ListByStationID returns stream variants ordered by priority ascending.
func (s *StationStreamStore) ListByStationID(ctx context.Context, stationID string) ([]*StationStream, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			id, station_id, url, resolved_url, kind, container, transport,
			mime_type, codec, bitrate, bit_depth, sample_rate_hz, channels,
			priority, is_active, health_score,
			last_checked_at, last_error
		FROM station_streams
		WHERE station_id = $1
		ORDER BY priority ASC, created_at ASC`, stationID)
	if err != nil {
		return nil, fmt.Errorf("list station streams: %w", err)
	}
	defer rows.Close()

	var out []*StationStream
	for rows.Next() {
		ss, err := scanStationStreamRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan station stream: %w", err)
		}
		out = append(out, ss)
	}
	return out, rows.Err()
}

// ListByStationIDs returns a station_id => streams map.
func (s *StationStreamStore) ListByStationIDs(ctx context.Context, stationIDs []string) (map[string][]*StationStream, error) {
	result := make(map[string][]*StationStream, len(stationIDs))
	if len(stationIDs) == 0 {
		return result, nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT
			id, station_id, url, resolved_url, kind, container, transport,
			mime_type, codec, bitrate, bit_depth, sample_rate_hz, channels,
			priority, is_active, health_score,
			last_checked_at, last_error
		FROM station_streams
		WHERE station_id = ANY($1::uuid[])
		ORDER BY station_id ASC, priority ASC, created_at ASC`, stationIDs)
	if err != nil {
		return nil, fmt.Errorf("list station streams by ids: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		ss, err := scanStationStreamRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan station stream: %w", err)
		}
		result[ss.StationID] = append(result[ss.StationID], ss)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// ReplaceForStation hard-replaces stream variants for one station.
func (s *StationStreamStore) ReplaceForStation(ctx context.Context, stationID string, streams []StationStreamInput) ([]*StationStream, error) {
	if len(streams) == 0 {
		return nil, fmt.Errorf("at least one stream is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin station stream replace: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM station_streams WHERE station_id = $1`, stationID); err != nil {
		return nil, fmt.Errorf("delete station streams: %w", err)
	}

	normalized := make([]StationStreamInput, 0, len(streams))
	for i, in := range streams {
		n := sanitizeStreamInput(in, i+1)
		if n.URL == "" {
			continue
		}
		normalized = append(normalized, n)
	}
	if len(normalized) == 0 {
		return nil, fmt.Errorf("at least one valid stream URL is required")
	}

	for _, in := range normalized {
		if _, err := tx.Exec(ctx, `
			INSERT INTO station_streams (
				station_id, url, resolved_url, kind, container, transport,
				mime_type, codec, bitrate, bit_depth, sample_rate_hz, channels,
				priority, is_active, health_score,
				last_checked_at, last_error, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10, $11, $12,
				$13, $14, $15,
				$16, $17, NOW()
			)`,
			stationID,
			in.URL,
			in.ResolvedURL,
			in.Kind,
			in.Container,
			in.Transport,
			in.MimeType,
			in.Codec,
			in.Bitrate,
			in.BitDepth,
			in.SampleRateHz,
			in.Channels,
			in.Priority,
			in.IsActive,
			in.HealthScore,
			in.LastCheckedAt,
			in.LastError,
		); err != nil {
			return nil, fmt.Errorf("insert station stream: %w", err)
		}
	}

	primary := normalized[0]
	for _, candidate := range normalized {
		if candidate.Priority < primary.Priority {
			primary = candidate
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE stations SET stream_url = $1, updated_at = NOW() WHERE id = $2`,
		primary.ResolvedURL,
		stationID,
	); err != nil {
		return nil, fmt.Errorf("mirror primary stream into station: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit station stream replace: %w", err)
	}

	return s.ListByStationID(ctx, stationID)
}

// UpsertPrimaryForStation ensures ingestion writes always have one stream row.
func (s *StationStreamStore) UpsertPrimaryForStation(ctx context.Context, stationID string, in StationStreamInput) error {
	n := sanitizeStreamInput(in, 1)
	if n.URL == "" {
		return nil
	}

	_, err := s.pool.Exec(ctx, `
		INSERT INTO station_streams (
			station_id, url, resolved_url, kind, container, transport,
			mime_type, codec, bitrate, bit_depth, sample_rate_hz, channels,
			priority, is_active, health_score,
			last_checked_at, last_error, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, $11, $12,
			1, true, $13,
			$14, $15, NOW()
		)
		ON CONFLICT (station_id, priority) DO UPDATE SET
			url = EXCLUDED.url,
			resolved_url = EXCLUDED.resolved_url,
			kind = EXCLUDED.kind,
			container = EXCLUDED.container,
			transport = EXCLUDED.transport,
			mime_type = EXCLUDED.mime_type,
			codec = EXCLUDED.codec,
			bitrate = EXCLUDED.bitrate,
			bit_depth = EXCLUDED.bit_depth,
			sample_rate_hz = EXCLUDED.sample_rate_hz,
			channels = EXCLUDED.channels,
			is_active = EXCLUDED.is_active,
			health_score = EXCLUDED.health_score,
			last_checked_at = EXCLUDED.last_checked_at,
			last_error = EXCLUDED.last_error,
			updated_at = NOW()`,
		stationID,
		n.URL,
		n.ResolvedURL,
		n.Kind,
		n.Container,
		n.Transport,
		n.MimeType,
		n.Codec,
		n.Bitrate,
		n.BitDepth,
		n.SampleRateHz,
		n.Channels,
		n.HealthScore,
		n.LastCheckedAt,
		n.LastError,
	)
	if err != nil {
		return fmt.Errorf("upsert primary station stream: %w", err)
	}
	return nil
}

// ProbeUpdate carries the fields written back after a live HTTP probe.
type ProbeUpdate struct {
	ResolvedURL   string
	Kind          string
	Container     string
	Transport     string
	MimeType      string
	Codec         string
	Bitrate       int
	BitDepth      int
	SampleRateHz  int
	Channels      int
	HealthScore   *float64
	LastCheckedAt time.Time
	LastError     *string
}

// ListAllActive returns every active stream ordered by last_checked_at ascending
// so the stalest entries are processed first by the re-probe loop.
func (s *StationStreamStore) ListAllActive(ctx context.Context) ([]*StationStream, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			id, station_id, url, resolved_url, kind, container, transport,
			mime_type, codec, bitrate, bit_depth, sample_rate_hz, channels,
			priority, is_active, health_score,
			last_checked_at, last_error
		FROM station_streams
		WHERE is_active = true
		ORDER BY last_checked_at ASC NULLS FIRST`)
	if err != nil {
		return nil, fmt.Errorf("list active station streams: %w", err)
	}
	defer rows.Close()

	var out []*StationStream
	for rows.Next() {
		ss, err := scanStationStreamRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan active station stream: %w", err)
		}
		out = append(out, ss)
	}
	return out, rows.Err()
}

// UpdateProbeResult writes back the fields discovered by a live HTTP probe.
// Bitrate is intentionally not updated here; it is set once at editorial save
// time and kept stable afterward.
func (s *StationStreamStore) UpdateProbeResult(ctx context.Context, id string, u ProbeUpdate) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE station_streams SET
			resolved_url   = $1,
			kind           = $2,
			container      = $3,
			transport      = $4,
			mime_type      = $5,
			codec          = CASE WHEN trim($6) <> '' THEN $6 ELSE codec END,
			bit_depth      = CASE WHEN $7 > 0       THEN $7 ELSE bit_depth END,
			sample_rate_hz = CASE WHEN $8 > 0       THEN $8 ELSE sample_rate_hz END,
			channels       = CASE WHEN $9 > 0       THEN $9 ELSE channels END,
			last_checked_at = $10,
			last_error     = $11,
			health_score   = CASE
				WHEN $12::double precision IS NULL THEN health_score
				WHEN $12::double precision < 0 THEN 0
				WHEN $12::double precision > 1 THEN 1
				ELSE $12::double precision
			END,
			updated_at     = NOW()
		WHERE id = $13`,
		u.ResolvedURL,
		u.Kind,
		u.Container,
		u.Transport,
		u.MimeType,
		u.Codec,
		u.BitDepth,
		u.SampleRateHz,
		u.Channels,
		u.LastCheckedAt,
		u.LastError,
		u.HealthScore,
		id,
	)
	if err != nil {
		return fmt.Errorf("update probe result: %w", err)
	}
	return nil
}
