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
	MetadataEnabled           bool
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
	MetadataEnabled           bool
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

type MetadataResolverSnapshot struct {
	Resolver    string
	MetadataURL *string
	CheckedAt   *time.Time
	Delayed     *bool
}

// StationStreamJobSummary contains approved stream worker freshness metrics for admin diagnostics.
type StationStreamJobSummary struct {
	ActiveStreams               int
	ProbeCheckedStreams         int
	ProbeDueStreams             int
	MetadataEnabledStreams      int
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
			COUNT(*) FILTER (WHERE ss.metadata_enabled = true)::int,
			COUNT(*) FILTER (WHERE ss.metadata_enabled = true AND ss.metadata_resolver_checked_at IS NOT NULL)::int,
			COUNT(*) FILTER (WHERE ss.metadata_enabled = true AND (ss.metadata_resolver_checked_at IS NULL OR ss.metadata_resolver_checked_at < NOW() - $1::interval))::int,
			MAX(ss.last_checked_at),
			MIN(ss.last_checked_at) FILTER (WHERE ss.last_checked_at IS NOT NULL),
			MAX(ss.metadata_resolver_checked_at) FILTER (WHERE ss.metadata_enabled = true)
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
		&summary.MetadataEnabledStreams,
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
		&s.MetadataEnabled,
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
		MetadataEnabled:           in.MetadataEnabled,
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

func normalizeMetadataResolver(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "server", "client", "none":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return ""
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
			priority, is_active, loudness_integrated_lufs, loudness_peak_dbfs, loudness_sample_duration_seconds, loudness_measured_at, loudness_measurement_status, metadata_enabled, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
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
			priority, is_active, loudness_integrated_lufs, loudness_peak_dbfs, loudness_sample_duration_seconds, loudness_measured_at, loudness_measurement_status, metadata_enabled, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
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
				metadata_enabled, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
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
			in.MetadataEnabled,
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
			metadata_enabled, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, metadata_provider, metadata_provider_config, health_score,
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
			resolved_url = EXCLUDED.resolved_url,
			kind = EXCLUDED.kind,
			container = EXCLUDED.container,
			transport = EXCLUDED.transport,
			mime_type = EXCLUDED.mime_type,
			codec = EXCLUDED.codec,
			bitrate = EXCLUDED.bitrate,
			bit_depth = EXCLUDED.bit_depth,
			sample_rate_hz = EXCLUDED.sample_rate_hz,
			sample_rate_confidence = EXCLUDED.sample_rate_confidence,
			channels = EXCLUDED.channels,
			is_active = EXCLUDED.is_active,
			loudness_integrated_lufs = EXCLUDED.loudness_integrated_lufs,
			loudness_peak_dbfs = EXCLUDED.loudness_peak_dbfs,
			loudness_sample_duration_seconds = EXCLUDED.loudness_sample_duration_seconds,
			loudness_measured_at = EXCLUDED.loudness_measured_at,
			loudness_measurement_status = EXCLUDED.loudness_measurement_status,
			metadata_enabled = EXCLUDED.metadata_enabled,
			metadata_type = EXCLUDED.metadata_type,
			metadata_source = EXCLUDED.metadata_source,
			metadata_url = EXCLUDED.metadata_url,
			metadata_resolver = EXCLUDED.metadata_resolver,
			metadata_resolver_checked_at = EXCLUDED.metadata_resolver_checked_at,
			metadata_delayed = EXCLUDED.metadata_delayed,
			metadata_provider = EXCLUDED.metadata_provider,
			metadata_provider_config = EXCLUDED.metadata_provider_config,
			health_score = EXCLUDED.health_score,
			next_probe_at = CASE
				WHEN station_streams.url != EXCLUDED.url THEN NOW()
				ELSE station_streams.next_probe_at
			END,
			last_checked_at = EXCLUDED.last_checked_at,
			last_error = EXCLUDED.last_error,
			last_probe_error_code = EXCLUDED.last_probe_error_code,
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
		n.MetadataEnabled,
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

// ProbeUpdate carries the fields written back after a live HTTP probe.
type ProbeUpdate struct {
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
	IncludeLoudness           bool
	LoudnessIntegratedLUFS    *float64
	LoudnessPeakDBFS          *float64
	LoudnessSampleDuration    float64
	LoudnessMeasuredAt        *time.Time
	LoudnessStatus            string
	HealthScore               *float64
	IncludeMetadataResolver   bool
	MetadataResolver          string
	MetadataURL               *string
	MetadataResolverCheckedAt *time.Time
	MetadataDelayed           *bool
	NextProbeAt               *time.Time
	LastCheckedAt             time.Time
	LastError                 *string
	LastErrorCode             string
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
			ss.priority, ss.is_active, ss.loudness_integrated_lufs, ss.loudness_peak_dbfs, ss.loudness_sample_duration_seconds, ss.loudness_measured_at, ss.loudness_measurement_status, ss.metadata_enabled, ss.metadata_type, ss.metadata_source, ss.metadata_url, ss.metadata_resolver, ss.metadata_resolver_checked_at, ss.metadata_delayed, ss.metadata_provider, ss.metadata_provider_config, ss.health_score,
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

// ListActiveMetadataEnabledForApprovedStations returns all active metadata-enabled
// streams attached to approved active stations. This powers explicit admin
// metadata coverage checks, independent of listener-driven polling state.
func (s *StationStreamStore) ListActiveMetadataEnabledForApprovedStations(ctx context.Context) ([]*StationStream, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			ss.id, ss.station_id, ss.url, ss.resolved_url, ss.kind, ss.container, ss.transport,
			ss.mime_type, ss.codec, ss.bitrate, ss.bit_depth, ss.sample_rate_hz, ss.sample_rate_confidence, ss.channels,
			ss.priority, ss.is_active, ss.loudness_integrated_lufs, ss.loudness_peak_dbfs, ss.loudness_sample_duration_seconds, ss.loudness_measured_at, ss.loudness_measurement_status, ss.metadata_enabled, ss.metadata_type, ss.metadata_source, ss.metadata_url, ss.metadata_resolver, ss.metadata_resolver_checked_at, ss.metadata_delayed, ss.metadata_provider, ss.metadata_provider_config, ss.health_score,
			ss.next_probe_at, ss.last_checked_at, ss.last_error, ss.last_probe_error_code
		FROM station_streams ss
		JOIN stations st ON st.id = ss.station_id
		WHERE ss.is_active = true
		  AND ss.metadata_enabled = true
		  AND st.is_active = true
		  AND st.status = 'approved'
		ORDER BY st.name ASC, ss.priority ASC, ss.created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("list active metadata-enabled approved station streams: %w", err)
	}
	defer rows.Close()

	var out []*StationStream
	for rows.Next() {
		ss, err := scanStationStreamRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan active metadata-enabled approved station stream: %w", err)
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
			sample_rate_confidence = CASE
				WHEN trim($9) = '' OR trim($9) = 'unknown' THEN sample_rate_confidence
				ELSE $9
			END,
			channels       = CASE WHEN $10 > 0       THEN $10 ELSE channels END,
			loudness_integrated_lufs = CASE
				WHEN $11::boolean THEN $12
				ELSE loudness_integrated_lufs
			END,
			loudness_peak_dbfs = CASE
				WHEN $11::boolean THEN $13
				ELSE loudness_peak_dbfs
			END,
			loudness_sample_duration_seconds = CASE
				WHEN NOT $11::boolean THEN loudness_sample_duration_seconds
				WHEN $14::double precision < 0 THEN 0
				ELSE $14::double precision
			END,
			loudness_measured_at = CASE
				WHEN $11::boolean THEN $15
				ELSE loudness_measured_at
			END,
			loudness_measurement_status = CASE
				WHEN $11::boolean THEN $16
				ELSE loudness_measurement_status
			END,
			metadata_resolver = CASE
				WHEN $17::boolean THEN $18
				ELSE metadata_resolver
			END,
			metadata_resolver_checked_at = CASE
				WHEN $17::boolean THEN $19
				ELSE metadata_resolver_checked_at
			END,
			metadata_url = CASE
				WHEN $17::boolean AND $20::text IS NOT NULL AND trim($20::text) <> '' THEN $20
				ELSE metadata_url
			END,
			metadata_delayed = CASE
				WHEN $17::boolean AND $21::boolean IS NOT NULL THEN $21
				ELSE metadata_delayed
			END,
			last_checked_at = $22,
			last_error     = $23,
			last_probe_error_code = $24,
			next_probe_at = COALESCE($25, next_probe_at),
			health_score   = CASE
				WHEN $26::double precision IS NULL THEN health_score
				WHEN $26::double precision < 0 THEN 0
				WHEN $26::double precision > 1 THEN 1
				ELSE $26::double precision
			END,
			updated_at     = NOW()
		WHERE id = $27`,
		u.ResolvedURL,
		u.Kind,
		u.Container,
		u.Transport,
		u.MimeType,
		u.Codec,
		u.BitDepth,
		u.SampleRateHz,
		normalizeSampleRateConfidence(u.SampleRateConfidence),
		u.Channels,
		u.IncludeLoudness,
		u.LoudnessIntegratedLUFS,
		u.LoudnessPeakDBFS,
		maxFloat64(u.LoudnessSampleDuration, 0),
		u.LoudnessMeasuredAt,
		normalizeLoudnessStatus(u.LoudnessStatus),
		u.IncludeMetadataResolver,
		normalizeMetadataResolver(u.MetadataResolver),
		u.MetadataResolverCheckedAt,
		normalizeMetadataURL(u.MetadataURL),
		u.MetadataDelayed,
		u.LastCheckedAt,
		u.LastError,
		normalizeProbeErrorCode(u.LastErrorCode),
		u.NextProbeAt,
		u.HealthScore,
		id,
	)
	if err != nil {
		return fmt.Errorf("update probe result: %w", err)
	}
	var stationID string
	if err := s.pool.QueryRow(ctx, `SELECT station_id FROM station_streams WHERE id = $1`, id).Scan(&stationID); err != nil {
		return fmt.Errorf("load stream station: %w", err)
	}
	if err := s.syncStationReliability(ctx, s.pool, stationID); err != nil {
		return err
	}
	return nil
}

// UpdateMetadataDetection writes the detected metadata source + URL hint back
// to the editorial row. Live now-playing data lives in stream_now_playing and
// is not touched here.
func (s *StationStreamStore) UpdateMetadataDetection(
	ctx context.Context,
	id string,
	metadataSource *string,
	metadataURL *string,
	metadataDelayed *bool,
) error {
	src := normalizeMetadataSource(metadataSource)
	url := normalizeMetadataURL(metadataURL)
	_, err := s.pool.Exec(ctx, `
		UPDATE station_streams
		SET
			metadata_source = COALESCE($1, metadata_source),
			metadata_url    = COALESCE($2, metadata_url),
			metadata_delayed = CASE
				WHEN $3::boolean IS NOT NULL THEN $3
				ELSE metadata_delayed
			END,
			updated_at      = NOW()
		WHERE id = $4
		  AND (
			($1::text IS NOT NULL AND metadata_source IS DISTINCT FROM $1)
			OR ($2::text IS NOT NULL AND metadata_url IS DISTINCT FROM $2)
			OR ($3::boolean IS NOT NULL AND metadata_delayed IS DISTINCT FROM $3)
		  )`,
		src,
		url,
		metadataDelayed,
		id,
	)
	if err != nil {
		return fmt.Errorf("update metadata detection: %w", err)
	}
	return nil
}

func (s *StationStreamStore) UpdateMetadataResolver(
	ctx context.Context,
	id string,
	snapshot MetadataResolverSnapshot,
) error {
	resolver := normalizeMetadataResolver(snapshot.Resolver)
	metadataURL := normalizeMetadataURL(snapshot.MetadataURL)
	_, err := s.pool.Exec(ctx, `
		UPDATE station_streams
		SET
			metadata_resolver = $1,
			metadata_url = CASE
				WHEN $2::text IS NOT NULL AND trim($2::text) <> '' THEN $2
				ELSE metadata_url
			END,
			metadata_resolver_checked_at = $3,
			metadata_delayed = CASE
				WHEN $4::boolean IS NOT NULL THEN $4
				ELSE metadata_delayed
			END,
			updated_at = NOW()
		WHERE id = $5
		  AND (
			metadata_resolver IS DISTINCT FROM $1
			OR (
				$2::text IS NOT NULL AND trim($2::text) <> ''
				AND metadata_url IS DISTINCT FROM $2
			)
			OR metadata_resolver_checked_at IS DISTINCT FROM $3
			OR ($4::boolean IS NOT NULL AND metadata_delayed IS DISTINCT FROM $4)
		  )`,
		resolver,
		metadataURL,
		snapshot.CheckedAt,
		snapshot.Delayed,
		id,
	)
	if err != nil {
		return fmt.Errorf("update metadata resolver: %w", err)
	}
	return nil
}

func (s *StationStreamStore) UpdateMetadataEnabled(ctx context.Context, id string, enabled bool) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE station_streams
		SET
			metadata_enabled = $1,
			updated_at = NOW()
		WHERE id = $2
		  AND metadata_enabled IS DISTINCT FROM $1`,
		enabled,
		id,
	)
	if err != nil {
		return fmt.Errorf("update metadata enabled: %w", err)
	}
	return nil
}
