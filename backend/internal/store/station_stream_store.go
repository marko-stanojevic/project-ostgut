package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StationStream represents one playable variant for a station.
type StationStream struct {
	ID                        string
	StationID                 string
	URL                       string
	ResolvedURL               string
	Kind                      string // direct | playlist | hls
	Container                 string // none | m3u | m3u8 | pls
	Transport                 string // http | https | icy | shoutcast | icecast
	MimeType                  string
	Codec                     string
	Bitrate                   int
	BitDepth                  int
	SampleRateHz              int
	SampleRateConfidence      string
	Channels                  int
	Priority                  int
	IsActive                  bool
	LoudnessIntegratedLUFS    *float64
	LoudnessPeakDBFS          *float64
	LoudnessSampleDuration    float64
	LoudnessMeasuredAt        *time.Time
	LoudnessStatus            string
	MetadataMode              string
	MetadataType              string
	MetadataSource            *string
	MetadataURL               *string
	MetadataResolver          string
	MetadataResolverCheckedAt *time.Time
	MetadataDelayed           bool
	MetadataProvider          *string
	MetadataProviderConfig    []byte
	HealthScore               float64
	NextProbeAt               time.Time
	LastCheckedAt             *time.Time
	LastError                 *string
	LastErrorCode             string
}

// StationStreamInput is the write payload for station stream variants.
type StationStreamInput struct {
	URL                       string
	ResolvedURL               string
	Kind                      string
	Container                 string
	Transport                 string
	MimeType                  string
	Codec                     string
	Bitrate                   int
	BitDepth                  int
	SampleRateHz              int
	SampleRateConfidence      string
	Channels                  int
	Priority                  int
	IsActive                  bool
	LoudnessIntegratedLUFS    *float64
	LoudnessPeakDBFS          *float64
	LoudnessSampleDuration    float64
	LoudnessMeasuredAt        *time.Time
	LoudnessStatus            string
	MetadataMode              string
	MetadataType              string
	MetadataSource            *string
	MetadataURL               *string
	MetadataResolver          string
	MetadataResolverCheckedAt *time.Time
	MetadataDelayed           bool
	MetadataProvider          *string
	MetadataProviderConfig    []byte
	HealthScore               float64
	NextProbeAt               *time.Time
	LastCheckedAt             *time.Time
	LastError                 *string
	LastErrorCode             string
}

// StationStreamJobSummary contains approved stream worker freshness metrics for admin diagnostics.
type StationStreamJobSummary struct {
	ActiveStreams               int
	ProbeCheckedStreams         int
	ProbeDueStreams             int
	MetadataConfiguredStreams   int
	MetadataResolverChecked     int
	MetadataResolverStale       int
	LastProbeCheckedAt          *time.Time
	OldestProbeCheckedAt        *time.Time
	LastMetadataResolverCheckAt *time.Time
}

// StationStreamStore executes queries against station_streams.
type StationStreamStore struct {
	pool *pgxpool.Pool
}

func NewStationStreamStore(pool *pgxpool.Pool) *StationStreamStore {
	return &StationStreamStore{pool: pool}
}

// AdminJobSummary returns approved stream probe and metadata resolver freshness metrics.
func (s *StationStreamStore) AdminJobSummary(ctx context.Context, metadataStaleAfter time.Duration) (*StationStreamJobSummary, error) {
	var summary StationStreamJobSummary
	err := s.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE ss.last_checked_at IS NOT NULL)::int,
			COUNT(*) FILTER (WHERE ss.next_probe_at <= NOW())::int,
			COUNT(*) FILTER (WHERE ss.metadata_mode = 'auto')::int,
			COUNT(*) FILTER (WHERE ss.metadata_mode = 'auto' AND ss.metadata_resolver_checked_at IS NOT NULL)::int,
			COUNT(*) FILTER (WHERE ss.metadata_mode = 'auto' AND (ss.metadata_resolver_checked_at IS NULL OR ss.metadata_resolver_checked_at < NOW() - $1::interval))::int,
			MAX(ss.last_checked_at),
			MIN(ss.last_checked_at) FILTER (WHERE ss.last_checked_at IS NOT NULL),
			MAX(ss.metadata_resolver_checked_at) FILTER (WHERE ss.metadata_mode = 'auto')
		FROM station_streams ss
		JOIN stations st ON st.id = ss.station_id
		WHERE ss.is_active = true
		  AND st.is_active = true
		  AND st.status = 'approved'`,
		postgresInterval(metadataStaleAfter),
	).Scan(
		&summary.ActiveStreams,
		&summary.ProbeCheckedStreams,
		&summary.ProbeDueStreams,
		&summary.MetadataConfiguredStreams,
		&summary.MetadataResolverChecked,
		&summary.MetadataResolverStale,
		&summary.LastProbeCheckedAt,
		&summary.OldestProbeCheckedAt,
		&summary.LastMetadataResolverCheckAt,
	)
	if err != nil {
		return nil, fmt.Errorf("admin approved stream job summary: %w", err)
	}
	return &summary, nil
}

func postgresInterval(duration time.Duration) string {
	if duration <= 0 {
		return "0 seconds"
	}
	return fmt.Sprintf("%d seconds", int64(duration.Seconds()))
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
		&s.SampleRateConfidence,
		&s.Channels,
		&s.Priority,
		&s.IsActive,
		&s.LoudnessIntegratedLUFS,
		&s.LoudnessPeakDBFS,
		&s.LoudnessSampleDuration,
		&s.LoudnessMeasuredAt,
		&s.LoudnessStatus,
		&s.MetadataMode,
		&s.MetadataType,
		&s.MetadataSource,
		&s.MetadataURL,
		&s.MetadataResolver,
		&s.MetadataResolverCheckedAt,
		&s.MetadataDelayed,
		&s.MetadataProvider,
		&s.MetadataProviderConfig,
		&s.HealthScore,
		&s.NextProbeAt,
		&s.LastCheckedAt,
		&s.LastError,
		&s.LastErrorCode,
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
	case "direct", "playlist", "hls", "dash":
	default:
		kind = "direct"
	}

	container := strings.ToLower(strings.TrimSpace(in.Container))
	switch container {
	case "none", "m3u", "m3u8", "pls", "mpd":
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

	metadataType := strings.ToLower(strings.TrimSpace(in.MetadataType))
	switch metadataType {
	case "", "auto":
		metadataType = "auto"
	case "icy", "icecast", "shoutcast", "id3", "vorbis", "hls", "dash", "epg":
	default:
		metadataType = "auto"
	}

	var metadataSource *string
	if v := normalizeMetadataSource(in.MetadataSource); v != nil {
		metadataSource = v
	}
	var metadataURL *string
	if v := normalizeMetadataURL(in.MetadataURL); v != nil {
		metadataURL = v
	}
	metadataProvider := normalizeMetadataProvider(in.MetadataProvider)
	metadataProviderConfig := normalizeMetadataProviderConfig(in.MetadataProviderConfig)

	return StationStreamInput{
		URL:                       url,
		ResolvedURL:               resolved,
		Kind:                      kind,
		Container:                 container,
		Transport:                 transport,
		MimeType:                  strings.TrimSpace(in.MimeType),
		Codec:                     strings.ToUpper(strings.TrimSpace(in.Codec)),
		Bitrate:                   in.Bitrate,
		BitDepth:                  in.BitDepth,
		SampleRateHz:              in.SampleRateHz,
		SampleRateConfidence:      normalizeSampleRateConfidence(in.SampleRateConfidence),
		Channels:                  in.Channels,
		Priority:                  priority,
		IsActive:                  in.IsActive,
		LoudnessIntegratedLUFS:    in.LoudnessIntegratedLUFS,
		LoudnessPeakDBFS:          in.LoudnessPeakDBFS,
		LoudnessSampleDuration:    maxFloat64(in.LoudnessSampleDuration, 0),
		LoudnessMeasuredAt:        in.LoudnessMeasuredAt,
		LoudnessStatus:            normalizeLoudnessStatus(in.LoudnessStatus),
		MetadataMode:              normalizeMetadataMode(in.MetadataMode),
		MetadataType:              metadataType,
		MetadataSource:            metadataSource,
		MetadataURL:               metadataURL,
		MetadataResolver:          normalizeMetadataResolver(in.MetadataResolver),
		MetadataResolverCheckedAt: in.MetadataResolverCheckedAt,
		MetadataDelayed:           in.MetadataDelayed,
		MetadataProvider:          metadataProvider,
		MetadataProviderConfig:    metadataProviderConfig,
		HealthScore:               health,
		LastCheckedAt:             in.LastCheckedAt,
		LastError:                 in.LastError,
	}
}

func normalizeMetadataProvider(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.ToLower(strings.TrimSpace(*v))
	switch trimmed {
	case "npr-composer", "nts-live":
		return &trimmed
	default:
		return nil
	}
}

func normalizeMetadataProviderConfig(v []byte) []byte {
	if len(v) == 0 {
		return []byte(`{}`)
	}
	var raw any
	if err := json.Unmarshal(v, &raw); err != nil {
		return []byte(`{}`)
	}
	normalized, err := json.Marshal(raw)
	if err != nil || len(normalized) == 0 || string(normalized) == "null" {
		return []byte(`{}`)
	}
	return normalized
}

func deriveStationReliabilityFromStreams(streams []StationStreamInput) float64 {
	best := 0.0
	for _, stream := range streams {
		if !stream.IsActive {
			continue
		}
		health := stream.HealthScore
		if health < 0 {
			health = 0
		}
		if health > 1 {
			health = 1
		}
		if health > best {
			best = health
		}
	}
	return best
}

func (s *StationStreamStore) syncStationReliability(ctx context.Context, q interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}, stationID string) error {
	_, err := q.Exec(ctx, `
		UPDATE stations
		SET
			reliability_score = coalesce((
				SELECT max(health_score)
				FROM station_streams
				WHERE station_id = $1
				  AND is_active = true
			), 0),
			updated_at = NOW()
		WHERE id = $1`,
		stationID,
	)
	if err != nil {
		return fmt.Errorf("sync station reliability: %w", err)
	}
	return nil
}

func normalizeMetadataSource(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.ToLower(strings.TrimSpace(*v))
	switch trimmed {
	case "icy", "icecast", "shoutcast", "id3", "vorbis", "hls", "dash", "epg", "npr-composer", "nts-live":
		return &trimmed
	default:
		return nil
	}
}

func normalizeMetadataURL(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeMetadataMode(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "off":
		return "off"
	default:
		return "auto"
	}
}

func normalizeMetadataResolver(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "unknown", "server", "client", "none":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "unknown"
	}
}

func normalizeSampleRateConfidence(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "parsed_streaminfo", "parsed_frame":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "unknown"
	}
}

func normalizeLoudnessStatus(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "measured", "insufficient_sample", "unavailable", "failed":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "unknown"
	}
}

func normalizeProbeErrorCode(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "invalid_url", "unsupported_scheme", "disallowed_host", "too_many_redirects", "redirect_unsupported_scheme", "too_many_host_changes", "timeout", "request_failed", "http_status", "playlist_depth_exceeded", "playlist_empty", "playlist_read_failed":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return ""
	}
}

func maxFloat64(value, fallback float64) float64 {
	if value < fallback {
		return fallback
	}
	return value
}

// ListByStationID returns stream variants ordered by priority ascending.
func (s *StationStreamStore) ListByStationID(ctx context.Context, stationID string) ([]*StationStream, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			id, station_id, url, resolved_url, kind, container, transport,
			mime_type, codec, bitrate, bit_depth, sample_rate_hz, sample_rate_confidence, channels,
			priority, is_active, loudness_integrated_lufs, loudness_peak_dbfs, loudness_sample_duration_seconds, loudness_measured_at, loudness_measurement_status, metadata_mode, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
			next_probe_at, last_checked_at, last_error, last_probe_error_code
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
			mime_type, codec, bitrate, bit_depth, sample_rate_hz, sample_rate_confidence, channels,
			priority, is_active, loudness_integrated_lufs, loudness_peak_dbfs, loudness_sample_duration_seconds, loudness_measured_at, loudness_measurement_status, metadata_mode, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
			next_probe_at, last_checked_at, last_error, last_probe_error_code
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
				mime_type, codec, bitrate, bit_depth, sample_rate_hz, sample_rate_confidence, channels,
				priority, is_active, loudness_integrated_lufs, loudness_peak_dbfs, loudness_sample_duration_seconds, loudness_measured_at, loudness_measurement_status,
				metadata_mode, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
				next_probe_at, last_checked_at, last_error, last_probe_error_code, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10, $11, $12, $13,
				$14, $15, $16, $17, $18, $19, $20,
				$21, $22, $23, $24, $25, $26, $27, $28, $29,
				$30, COALESCE($31, NOW()), $32, $33, $34, NOW()
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
			in.SampleRateConfidence,
			in.Channels,
			in.Priority,
			in.IsActive,
			in.LoudnessIntegratedLUFS,
			in.LoudnessPeakDBFS,
			in.LoudnessSampleDuration,
			in.LoudnessMeasuredAt,
			in.LoudnessStatus,
			in.MetadataMode,
			in.MetadataType,
			in.MetadataSource,
			in.MetadataURL,
			in.MetadataResolver,
			in.MetadataResolverCheckedAt,
			in.MetadataDelayed,
			in.MetadataProvider,
			in.MetadataProviderConfig,
			in.HealthScore,
			in.NextProbeAt,
			in.LastCheckedAt,
			in.LastError,
			normalizeProbeErrorCode(in.LastErrorCode),
		); err != nil {
			return nil, fmt.Errorf("insert station stream: %w", err)
		}
	}

	if err := s.syncStationReliability(ctx, tx, stationID); err != nil {
		return nil, err
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
			mime_type, codec, bitrate, bit_depth, sample_rate_hz, sample_rate_confidence, channels,
			priority, is_active, loudness_integrated_lufs, loudness_peak_dbfs, loudness_sample_duration_seconds, loudness_measured_at, loudness_measurement_status,
			metadata_mode, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
			next_probe_at, last_checked_at, last_error, last_probe_error_code, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, $11, $12, $13,
			1, true, $14, $15, $16, $17, $18,
			$19, $20, $21, $22, $23, $24, $25, $26, $27,
			$28, COALESCE($29, NOW()), $30, $31, $32, NOW()
		)
		ON CONFLICT (station_id, priority) DO UPDATE SET
			url = EXCLUDED.url,
			resolved_url = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.resolved_url
				ELSE station_streams.resolved_url
			END,
			kind = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.kind
				ELSE station_streams.kind
			END,
			container = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.container
				ELSE station_streams.container
			END,
			transport = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.transport
				ELSE station_streams.transport
			END,
			mime_type = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.mime_type
				ELSE station_streams.mime_type
			END,
			codec = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.codec
				ELSE station_streams.codec
			END,
			bitrate = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.bitrate
				ELSE station_streams.bitrate
			END,
			bit_depth = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.bit_depth
				ELSE station_streams.bit_depth
			END,
			sample_rate_hz = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.sample_rate_hz
				ELSE station_streams.sample_rate_hz
			END,
			sample_rate_confidence = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.sample_rate_confidence
				ELSE station_streams.sample_rate_confidence
			END,
			channels = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.channels
				ELSE station_streams.channels
			END,
			is_active = EXCLUDED.is_active,
			loudness_integrated_lufs = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.loudness_integrated_lufs
				ELSE station_streams.loudness_integrated_lufs
			END,
			loudness_peak_dbfs = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.loudness_peak_dbfs
				ELSE station_streams.loudness_peak_dbfs
			END,
			loudness_sample_duration_seconds = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.loudness_sample_duration_seconds
				ELSE station_streams.loudness_sample_duration_seconds
			END,
			loudness_measured_at = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.loudness_measured_at
				ELSE station_streams.loudness_measured_at
			END,
			loudness_measurement_status = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.loudness_measurement_status
				ELSE station_streams.loudness_measurement_status
			END,
			metadata_mode = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_mode
				ELSE station_streams.metadata_mode
			END,
			metadata_type = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_type
				ELSE station_streams.metadata_type
			END,
			metadata_source = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_source
				ELSE station_streams.metadata_source
			END,
			metadata_url = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_url
				ELSE station_streams.metadata_url
			END,
			metadata_resolver = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_resolver
				ELSE station_streams.metadata_resolver
			END,
			metadata_resolver_checked_at = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_resolver_checked_at
				ELSE station_streams.metadata_resolver_checked_at
			END,
			metadata_delayed = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_delayed
				ELSE station_streams.metadata_delayed
			END,
			metadata_provider = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_provider
				ELSE station_streams.metadata_provider
			END,
			metadata_provider_config = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.metadata_provider_config
				ELSE station_streams.metadata_provider_config
			END,
			health_score = EXCLUDED.health_score,
			next_probe_at = CASE
				WHEN station_streams.url != EXCLUDED.url THEN NOW()
				ELSE station_streams.next_probe_at
			END,
			last_checked_at = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.last_checked_at
				ELSE station_streams.last_checked_at
			END,
			last_error = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.last_error
				ELSE station_streams.last_error
			END,
			last_probe_error_code = CASE
				WHEN station_streams.url IS DISTINCT FROM EXCLUDED.url THEN EXCLUDED.last_probe_error_code
				ELSE station_streams.last_probe_error_code
			END,
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
		n.SampleRateConfidence,
		n.Channels,
		n.LoudnessIntegratedLUFS,
		n.LoudnessPeakDBFS,
		n.LoudnessSampleDuration,
		n.LoudnessMeasuredAt,
		n.LoudnessStatus,
		n.MetadataMode,
		n.MetadataType,
		n.MetadataSource,
		n.MetadataURL,
		n.MetadataResolver,
		n.MetadataResolverCheckedAt,
		n.MetadataDelayed,
		n.MetadataProvider,
		n.MetadataProviderConfig,
		n.HealthScore,
		n.NextProbeAt,
		n.LastCheckedAt,
		n.LastError,
		normalizeProbeErrorCode(n.LastErrorCode),
	)
	if err != nil {
		return fmt.Errorf("upsert primary station stream: %w", err)
	}
	if err := s.syncStationReliability(ctx, s.pool, stationID); err != nil {
		return err
	}
	return nil
}

// ListDueActiveForApprovedStations returns active streams for approved stations
// whose next_probe_at has arrived, ordered by next probe time and then stale
// probe evidence so the recurring worker spends its budget on due listener-facing streams first.
func (s *StationStreamStore) ListDueActiveForApprovedStations(ctx context.Context, now time.Time, limit int) ([]*StationStream, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := s.pool.Query(ctx, `
		SELECT
			ss.id, ss.station_id, ss.url, ss.resolved_url, ss.kind, ss.container, ss.transport,
			ss.mime_type, ss.codec, ss.bitrate, ss.bit_depth, ss.sample_rate_hz, ss.sample_rate_confidence, ss.channels,
			ss.priority, ss.is_active, ss.loudness_integrated_lufs, ss.loudness_peak_dbfs, ss.loudness_sample_duration_seconds, ss.loudness_measured_at, ss.loudness_measurement_status, ss.metadata_mode, ss.metadata_type, ss.metadata_source, ss.metadata_url, ss.metadata_resolver, ss.metadata_resolver_checked_at, ss.metadata_delayed, ss.metadata_provider, ss.metadata_provider_config, ss.health_score,
			ss.next_probe_at, ss.last_checked_at, ss.last_error, ss.last_probe_error_code
		FROM station_streams ss
		JOIN stations st ON st.id = ss.station_id
		WHERE ss.is_active = true
		  AND st.is_active = true
		  AND st.status = 'approved'
		  AND ss.next_probe_at <= $1
		ORDER BY ss.next_probe_at ASC, ss.last_checked_at ASC NULLS FIRST
		LIMIT $2`, now.UTC(), limit)
	if err != nil {
		return nil, fmt.Errorf("list due active approved station streams: %w", err)
	}
	defer rows.Close()

	var out []*StationStream
	for rows.Next() {
		ss, err := scanStationStreamRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan due active approved station stream: %w", err)
		}
		out = append(out, ss)
	}
	return out, rows.Err()
}

// ListActiveForApprovedStations returns all active streams attached to approved
// active stations. Admin maintenance jobs use this authoritative listener-facing
// scope for re-probing and metadata fetches.
func (s *StationStreamStore) ListActiveForApprovedStations(ctx context.Context) ([]*StationStream, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			ss.id, ss.station_id, ss.url, ss.resolved_url, ss.kind, ss.container, ss.transport,
			ss.mime_type, ss.codec, ss.bitrate, ss.bit_depth, ss.sample_rate_hz, ss.sample_rate_confidence, ss.channels,
			ss.priority, ss.is_active, ss.loudness_integrated_lufs, ss.loudness_peak_dbfs, ss.loudness_sample_duration_seconds, ss.loudness_measured_at, ss.loudness_measurement_status, ss.metadata_mode, ss.metadata_type, ss.metadata_source, ss.metadata_url, ss.metadata_resolver, ss.metadata_resolver_checked_at, ss.metadata_delayed, ss.metadata_provider, ss.metadata_provider_config, ss.health_score,
			ss.next_probe_at, ss.last_checked_at, ss.last_error, ss.last_probe_error_code
		FROM station_streams ss
		JOIN stations st ON st.id = ss.station_id
		WHERE ss.is_active = true
		  AND st.is_active = true
		  AND st.status = 'approved'
		ORDER BY st.name ASC, ss.priority ASC, ss.created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("list active approved station streams: %w", err)
	}
	defer rows.Close()

	var out []*StationStream
	for rows.Next() {
		ss, err := scanStationStreamRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan active approved station stream: %w", err)
		}
		out = append(out, ss)
	}
	return out, rows.Err()
}
