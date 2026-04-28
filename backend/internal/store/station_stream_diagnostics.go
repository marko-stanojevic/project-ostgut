package store

import (
	"context"
	"fmt"
	"time"
)

type StreamDiagnosticsUpdate struct {
	Quality  *StreamQualityUpdate
	Loudness *StreamLoudnessUpdate
	Metadata *StreamMetadataUpdate
}

type StreamQualityUpdate struct {
	ResolvedURL          string
	Kind                 string
	Container            string
	Transport            string
	MimeType             string
	Codec                string
	BitDepth             int
	SampleRateHz         int
	SampleRateConfidence string
	Channels             int
	HealthScore          *float64
	NextProbeAt          *time.Time
	LastCheckedAt        time.Time
	LastError            *string
	LastErrorCode        string
}

type StreamLoudnessUpdate struct {
	IntegratedLUFS *float64
	PeakDBFS       *float64
	SampleDuration float64
	MeasuredAt     *time.Time
	Status         string
}

type StreamMetadataUpdate struct {
	Mode              *string
	Source            *string
	URL               *string
	Delayed           *bool
	IncludeResolver   bool
	Resolver          string
	ResolverCheckedAt *time.Time
}

func (s *StationStreamStore) ApplyDiagnosticsUpdate(ctx context.Context, id string, update StreamDiagnosticsUpdate) error {
	includeQuality := update.Quality != nil
	includeLoudness := update.Loudness != nil
	includeMetadata := update.Metadata != nil
	includeResolver := includeMetadata && update.Metadata.IncludeResolver

	var quality StreamQualityUpdate
	if update.Quality != nil {
		quality = *update.Quality
	}

	var loudness StreamLoudnessUpdate
	if update.Loudness != nil {
		loudness = *update.Loudness
	}

	var metadata StreamMetadataUpdate
	if update.Metadata != nil {
		metadata = *update.Metadata
	}

	_, err := s.pool.Exec(ctx, `
		UPDATE station_streams SET
			resolved_url = CASE WHEN $1::boolean THEN $2 ELSE resolved_url END,
			kind = CASE WHEN $1::boolean THEN $3 ELSE kind END,
			container = CASE WHEN $1::boolean THEN $4 ELSE container END,
			transport = CASE WHEN $1::boolean THEN $5 ELSE transport END,
			mime_type = CASE WHEN $1::boolean THEN $6 ELSE mime_type END,
			codec = CASE
				WHEN $1::boolean AND trim($7) <> '' THEN $7
				ELSE codec
			END,
			bit_depth = CASE
				WHEN $1::boolean AND $8 > 0 THEN $8
				ELSE bit_depth
			END,
			sample_rate_hz = CASE
				WHEN $1::boolean AND $9 > 0 THEN $9
				ELSE sample_rate_hz
			END,
			sample_rate_confidence = CASE
				WHEN $1::boolean AND trim($10) <> '' AND trim($10) <> 'unknown' THEN $10
				ELSE sample_rate_confidence
			END,
			channels = CASE
				WHEN $1::boolean AND $11 > 0 THEN $11
				ELSE channels
			END,
			loudness_integrated_lufs = CASE
				WHEN $12::boolean THEN $13
				ELSE loudness_integrated_lufs
			END,
			loudness_peak_dbfs = CASE
				WHEN $12::boolean THEN $14
				ELSE loudness_peak_dbfs
			END,
			loudness_sample_duration_seconds = CASE
				WHEN NOT $12::boolean THEN loudness_sample_duration_seconds
				WHEN $15::double precision < 0 THEN 0
				ELSE $15::double precision
			END,
			loudness_measured_at = CASE
				WHEN $12::boolean THEN $16
				ELSE loudness_measured_at
			END,
			loudness_measurement_status = CASE
				WHEN $12::boolean THEN $17
				ELSE loudness_measurement_status
			END,
			metadata_mode = CASE
				WHEN $18::text IS NOT NULL THEN $18
				ELSE metadata_mode
			END,
			metadata_source = CASE
				WHEN $19::boolean AND $20::text IS NOT NULL AND trim($20::text) <> '' THEN $20
				ELSE metadata_source
			END,
			metadata_url = CASE
				WHEN $19::boolean AND $21::text IS NOT NULL AND trim($21::text) <> '' THEN $21
				ELSE metadata_url
			END,
			metadata_delayed = CASE
				WHEN $22::boolean IS NOT NULL THEN $22
				ELSE metadata_delayed
			END,
			metadata_resolver = CASE
				WHEN $23::boolean THEN $24
				ELSE metadata_resolver
			END,
			metadata_resolver_checked_at = CASE
				WHEN $23::boolean THEN $25
				ELSE metadata_resolver_checked_at
			END,
			last_checked_at = CASE
				WHEN $1::boolean THEN $26
				ELSE last_checked_at
			END,
			last_error = CASE
				WHEN $1::boolean THEN $27
				ELSE last_error
			END,
			last_probe_error_code = CASE
				WHEN $1::boolean THEN $28
				ELSE last_probe_error_code
			END,
			next_probe_at = CASE
				WHEN $1::boolean THEN COALESCE($29, next_probe_at)
				ELSE next_probe_at
			END,
			health_score = CASE
				WHEN NOT $1::boolean OR $30::double precision IS NULL THEN health_score
				WHEN $30::double precision < 0 THEN 0
				WHEN $30::double precision > 1 THEN 1
				ELSE $30::double precision
			END,
			updated_at = NOW()
		WHERE id = $31`,
		includeQuality,
		quality.ResolvedURL,
		quality.Kind,
		quality.Container,
		quality.Transport,
		quality.MimeType,
		quality.Codec,
		quality.BitDepth,
		quality.SampleRateHz,
		normalizeSampleRateConfidence(quality.SampleRateConfidence),
		quality.Channels,
		includeLoudness,
		loudness.IntegratedLUFS,
		loudness.PeakDBFS,
		maxFloat64(loudness.SampleDuration, 0),
		loudness.MeasuredAt,
		normalizeLoudnessStatus(loudness.Status),
		normalizeOptionalMetadataMode(metadata.Mode),
		includeMetadata,
		normalizeMetadataSource(metadata.Source),
		normalizeMetadataURL(metadata.URL),
		metadata.Delayed,
		includeResolver,
		normalizeMetadataResolver(metadata.Resolver),
		metadata.ResolverCheckedAt,
		quality.LastCheckedAt,
		quality.LastError,
		normalizeProbeErrorCode(quality.LastErrorCode),
		quality.NextProbeAt,
		quality.HealthScore,
		id,
	)
	if err != nil {
		return fmt.Errorf("apply stream diagnostics update: %w", err)
	}

	if !includeQuality {
		return nil
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

func normalizeOptionalMetadataMode(v *string) *string {
	if v == nil {
		return nil
	}
	mode := normalizeMetadataMode(*v)
	return &mode
}
