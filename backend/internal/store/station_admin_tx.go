package store

import (
	"context"
	"errors"
	"fmt"
)

// UpdateEnrichmentAndStreams updates station enrichment fields and replaces all
// stream variants in one transaction so admin saves are atomic.
func (s *StationStore) UpdateEnrichmentAndStreams(
	ctx context.Context,
	id string,
	u EnrichmentUpdate,
	streams []StationStreamInput,
) error {
	if len(streams) == 0 {
		return s.UpdateEnrichment(ctx, id, u)
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
		return fmt.Errorf("at least one valid stream URL is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin station+streams update: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	genreTags := normalizeTagValues(u.GenreTags)
	subgenreTags := normalizeTagValues(u.SubgenreTags)
	styleTags := normalizeTagValues(u.StyleTags)
	formatTags := normalizeTagValues(u.FormatTags)
	textureTags := normalizeTagValues(u.TextureTags)
	searchTags := deriveSearchTags(genreTags, subgenreTags, styleTags, formatTags, textureTags)

	if _, err := tx.Exec(ctx, `
		UPDATE stations SET
			name                  = $1,
			homepage              = $2,
			logo                  = $3,
			genre_tags            = $4,
			subgenre_tags         = $5,
			search_tags           = $6,
			language              = $7,
			country               = $8,
			city                  = $9,
			style_tags            = $10,
			format_tags           = $11,
			texture_tags          = $12,
			reliability_score     = $13,
			status                = $14,
			editorial_review      = $15,
			internal_notes        = $16,
			overview              = $17,
			featured              = $18,
			last_editor_action_at = NOW(),
			updated_at            = NOW()
		WHERE id = $19`,
		u.Name, u.Homepage, u.Logo,
		genreTags, subgenreTags, searchTags, u.Language, u.Country, u.City,
		styleTags, formatTags, textureTags,
		deriveStationReliabilityFromStreams(normalized),
		u.Status, u.EditorialReview, u.InternalNotes, u.Overview, u.Featured, id,
	); err != nil {
		if terr := translateStationWriteErr(err); errors.Is(terr, ErrDuplicateStationName) {
			return terr
		}
		return fmt.Errorf("update station enrichment: %w", err)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM station_streams WHERE station_id = $1`, id); err != nil {
		return fmt.Errorf("delete station streams: %w", err)
	}

	for _, in := range normalized {
		if _, err := tx.Exec(ctx, `
			INSERT INTO station_streams (
				station_id, url, resolved_url, kind, container, transport,
				mime_type, codec, bitrate, bit_depth, sample_rate_hz, sample_rate_confidence, channels,
				priority, is_active, loudness_integrated_lufs, loudness_peak_dbfs, loudness_sample_duration_seconds, loudness_measured_at, loudness_measurement_status,
				metadata_enabled, metadata_type, metadata_source, metadata_url, metadata_resolver, metadata_resolver_checked_at, metadata_delayed, health_score,
				next_probe_at, last_checked_at, last_error, last_probe_error_code, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10, $11, $12, $13,
				$14, $15, $16, $17, $18, $19, $20,
				$21, $22, $23, $24, $25, $26, $27, $28,
				COALESCE($29, NOW()), $30, $31, $32, NOW()
			)`,
			id,
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
			in.HealthScore,
			in.NextProbeAt,
			in.LastCheckedAt,
			in.LastError,
			normalizeProbeErrorCode(in.LastErrorCode),
		); err != nil {
			return fmt.Errorf("insert station stream: %w", err)
		}
	}

	if u.Status == "approved" {
		if _, err := tx.Exec(ctx, `
			UPDATE station_streams
			SET next_probe_at = NOW(), updated_at = NOW()
			WHERE station_id = $1`, id); err != nil {
			return fmt.Errorf("mark approved station streams due: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit station+streams update: %w", err)
	}
	return nil
}
