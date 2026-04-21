package store

import (
	"context"
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

	primary := normalized[0]
	for _, candidate := range normalized {
		if candidate.Priority < primary.Priority {
			primary = candidate
		}
	}
	stationStreamURL := primary.ResolvedURL
	if stationStreamURL == "" {
		stationStreamURL = primary.URL
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin station+streams update: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tags := normalizeTags(u.Tags)
	styleTags := normalizeTags(u.StyleTags)
	formatTags := normalizeTags(u.FormatTags)
	textureTags := normalizeTags(u.TextureTags)

	if _, err := tx.Exec(ctx, `
		UPDATE stations SET
			name                  = $1,
			stream_url            = $2,
			homepage              = $3,
			logo                  = $4,
			genres                = $5,
			language              = $6,
			country               = $7,
			city                  = $8,
			country_code          = $9,
			tags                  = $10,
			style_tags            = $11,
			format_tags           = $12,
			texture_tags          = $13,
			reliability_score     = $14,
			status                = $15,
			metadata_enabled      = $16,
			metadata_type         = $17,
			editor_notes          = $18,
			overview              = $19,
			featured              = $20,
			last_editor_action_at = NOW(),
			updated_at            = NOW()
		WHERE id = $21`,
		u.Name, stationStreamURL, u.Homepage, u.Logo,
		normalizeGenres(u.Genres), u.Language, u.Country, u.City, u.CountryCode, tags,
		styleTags, formatTags, textureTags,
		u.ReliabilityScore,
		u.Status, u.MetadataEnabled, u.MetadataType, u.EditorNotes, u.Overview, u.Featured, id,
	); err != nil {
		return fmt.Errorf("update station enrichment: %w", err)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM station_streams WHERE station_id = $1`, id); err != nil {
		return fmt.Errorf("delete station streams: %w", err)
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
			in.Channels,
			in.Priority,
			in.IsActive,
			in.HealthScore,
			in.LastCheckedAt,
			in.LastError,
		); err != nil {
			return fmt.Errorf("insert station stream: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit station+streams update: %w", err)
	}
	return nil
}
