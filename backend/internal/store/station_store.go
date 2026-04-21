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

// Station holds a row from the stations table.
type Station struct {
	ID               string
	ExternalID       string
	Name             string
	CustomName       *string
	StreamURL        string
	Homepage         string
	Logo             string
	Genres           []string
	Language         string
	Country          string
	City             string
	CountryCode      string
	Tags             []string
	StyleTags        []string
	FormatTags       []string
	TextureTags      []string
	Votes            int
	ClickCount       int
	ReliabilityScore float64
	IsActive         bool
	Featured         bool
	Status           string // pending | approved | rejected
	CustomWebsite    *string
	Overview         *string
	EditorNotes      *string
	LastCheckedAt    *time.Time
	LastSyncedAt     time.Time
}

// StationFilter holds optional query parameters for listing stations.
type StationFilter struct {
	Genre        string // filter by one genre (matched against any element in Genres)
	CountryCode  string
	Language     string
	MinBitrate   int
	Style        string
	Format       string
	Texture      string
	Search       string
	Sort         string // "popular" = click_count DESC
	FeaturedOnly bool
	Status       string // empty = approved only (public default)
	Limit        int
	Offset       int
}

// EnrichmentUpdate carries editable station fields for admin updates.
type EnrichmentUpdate struct {
	Name             string
	StreamURL        string
	Homepage         string
	Logo             string
	Genres           []string
	Language         string
	Country          string
	City             string
	CountryCode      string
	Tags             []string
	StyleTags        []string
	FormatTags       []string
	TextureTags      []string
	ReliabilityScore float64
	Status           string
	Overview         *string
	EditorNotes      *string
	Featured         bool
}

// ManualStationInput carries fields for creating a station directly from admin.
type ManualStationInput struct {
	Name             string
	StreamURL        string
	Homepage         string
	Logo             string
	Genres           []string
	Language         string
	Country          string
	City             string
	CountryCode      string
	Tags             []string
	StyleTags        []string
	FormatTags       []string
	TextureTags      []string
	ReliabilityScore float64
	Status           string
	Featured         bool
	Overview         *string
}

// StationStore executes queries against the stations table.
type StationStore struct {
	pool *pgxpool.Pool
}

// NewStationStore creates a StationStore backed by the given pool.
func NewStationStore(pool *pgxpool.Pool) *StationStore {
	return &StationStore{pool: pool}
}

const stationColumns = `
	id, external_id, name, custom_name, stream_url, homepage, logo,
	genres, language, country, city, country_code, tags,
	style_tags, format_tags, texture_tags,
	votes, click_count, reliability_score,
	is_active, featured, status,
	custom_website, overview, editor_notes,
	last_checked_at, last_synced_at`

func scanStation(row pgx.Row) (*Station, error) {
	var s Station
	err := row.Scan(
		&s.ID, &s.ExternalID, &s.Name, &s.CustomName, &s.StreamURL, &s.Homepage, &s.Logo,
		&s.Genres, &s.Language, &s.Country, &s.City, &s.CountryCode, &s.Tags,
		&s.StyleTags, &s.FormatTags, &s.TextureTags,
		&s.Votes, &s.ClickCount, &s.ReliabilityScore,
		&s.IsActive, &s.Featured, &s.Status,
		&s.CustomWebsite, &s.Overview, &s.EditorNotes,
		&s.LastCheckedAt, &s.LastSyncedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func normalizeTags(tags []string) []string {
	if tags == nil {
		return []string{}
	}
	return tags
}

// normalizeGenres trims, lowercases, and removes empty/duplicate genre values.
func normalizeGenres(genres []string) []string {
	seen := make(map[string]struct{}, len(genres))
	out := make([]string, 0, len(genres))
	for _, g := range genres {
		v := strings.ToLower(strings.TrimSpace(g))
		if v == "" {
			continue
		}
		if _, dup := seen[v]; dup {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

// GetByID returns a single approved station by its internal UUID.
func (s *StationStore) GetByID(ctx context.Context, id string) (*Station, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+stationColumns+` FROM stations WHERE id = $1 AND is_active = true AND status = 'approved'`, id)
	st, err := scanStation(row)
	if err != nil {
		return nil, fmt.Errorf("get station: %w", err)
	}
	return st, nil
}

// GetByIDAdmin returns any station by ID regardless of status (for admin use).
func (s *StationStore) GetByIDAdmin(ctx context.Context, id string) (*Station, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+stationColumns+` FROM stations WHERE id = $1`, id)
	st, err := scanStation(row)
	if err != nil {
		return nil, fmt.Errorf("get station (admin): %w", err)
	}
	return st, nil
}

// List returns stations matching the given filter.
// If filter.Status is empty, only approved stations are returned (public default).
func (s *StationStore) List(ctx context.Context, f StationFilter) ([]*Station, error) {
	if f.Limit == 0 {
		f.Limit = 50
	}
	statusFilter := f.Status
	if statusFilter == "" {
		statusFilter = "approved"
	}

	args := []any{}
	i := 1

	where := fmt.Sprintf("is_active = true AND status = $%d", i)
	args = append(args, statusFilter)
	i++

	if f.Genre != "" {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(genres) g WHERE lower(g) = $%d)", i)
		args = append(args, f.Genre)
		i++
	}
	if f.CountryCode != "" {
		where += fmt.Sprintf(" AND upper(country_code) = $%d", i)
		args = append(args, f.CountryCode)
		i++
	}
	if f.Language != "" {
		where += fmt.Sprintf(" AND lower(language) = $%d", i)
		args = append(args, f.Language)
		i++
	}
	if f.MinBitrate > 0 {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM station_streams WHERE station_id = stations.id AND bitrate >= $%d)", i)
		args = append(args, f.MinBitrate)
		i++
	}
	if f.Style != "" {
		where += fmt.Sprintf(" AND $%d = ANY(style_tags)", i)
		args = append(args, f.Style)
		i++
	}
	if f.Format != "" {
		where += fmt.Sprintf(" AND $%d = ANY(format_tags)", i)
		args = append(args, f.Format)
		i++
	}
	if f.Texture != "" {
		where += fmt.Sprintf(" AND $%d = ANY(texture_tags)", i)
		args = append(args, f.Texture)
		i++
	}
	if f.FeaturedOnly {
		where += " AND featured = true"
	}

	trimmedSearch := strings.TrimSpace(f.Search)
	var searchClauses []string
	if trimmedSearch != "" {
		for _, term := range strings.Fields(trimmedSearch) {
			pattern := "%" + term + "%"
			searchClauses = append(searchClauses, fmt.Sprintf(`
				(
					name ILIKE $%[1]d OR
					EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE $%[2]d) OR
					language ILIKE $%[3]d OR
					country ILIKE $%[4]d OR
					city ILIKE $%[5]d OR
					country_code ILIKE $%[6]d OR
					EXISTS (
						SELECT 1
						FROM unnest(tags) AS tag
						WHERE tag ILIKE $%[7]d
					)
				)`, i, i+1, i+2, i+3, i+4, i+5, i+6))
			args = append(args, pattern, pattern, pattern, pattern, pattern, pattern, pattern)
			i += 7
		}
	}

	searchClause := ""
	if len(searchClauses) > 0 {
		searchClause = " AND " + strings.Join(searchClauses, " AND ")
	}

	orderClause := "featured DESC, reliability_score DESC"
	if f.Sort == "popular" {
		orderClause = "click_count DESC, reliability_score DESC"
	}
	if trimmedSearch != "" {
		exactMatch := strings.ToLower(trimmedSearch)
		prefixMatch := exactMatch + "%"
		containsMatch := "%" + exactMatch + "%"

		orderClause = fmt.Sprintf(`
			CASE
				WHEN lower(name) = $%d THEN 0
				WHEN lower(name) LIKE $%d THEN 1
				WHEN lower(name) LIKE $%d THEN 2
				WHEN EXISTS (
					SELECT 1
					FROM unnest(tags) AS tag
					WHERE lower(tag) = $%d
				) THEN 3
				WHEN EXISTS (SELECT 1 FROM unnest(genres) g WHERE lower(g) LIKE $%d) THEN 4
				WHEN lower(country) LIKE $%d OR lower(language) LIKE $%d THEN 5
				ELSE 6
			END,
			featured DESC,
			reliability_score DESC,
			name ASC`, i, i+1, i+2, i+3, i+4, i+5, i+6)
		args = append(args, exactMatch, prefixMatch, containsMatch, exactMatch, prefixMatch, prefixMatch, prefixMatch)
		i += 7
	}

	args = append(args, f.Limit, f.Offset)
	limitClause := fmt.Sprintf("$%d OFFSET $%d", i, i+1)

	q := fmt.Sprintf(`
		SELECT %s FROM stations
		WHERE %s%s
		ORDER BY %s
		LIMIT %s`, stationColumns, where, searchClause, orderClause, limitClause)

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list stations: %w", err)
	}
	defer rows.Close()

	var result []*Station
	for rows.Next() {
		st, err := scanStation(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, st)
	}
	return result, rows.Err()
}

// Upsert inserts or updates a station by external_id.
// On conflict it updates operational sync fields while preserving core station
// metadata, so admin edits to original station fields are not overwritten.
func (s *StationStore) Upsert(ctx context.Context, st *Station) (string, error) {
	tags := normalizeTags(st.Tags)

	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO stations (
			external_id, name, stream_url, homepage, logo,
			genres, language, country, city, country_code, tags,
			votes, click_count, reliability_score,
			is_active, status, last_synced_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',NOW(),NOW()
		)
		ON CONFLICT (external_id) DO UPDATE SET
			votes             = EXCLUDED.votes,
			click_count       = EXCLUDED.click_count,
			reliability_score = EXCLUDED.reliability_score,
			is_active         = EXCLUDED.is_active,
			last_synced_at    = NOW(),
			updated_at        = NOW()
			-- NOTE: name, stream_url, homepage, logo, genres, language,
			-- country, country_code, tags, status,
			-- editor_notes, featured are intentionally NOT updated
		RETURNING id`,
		st.ExternalID, st.Name, st.StreamURL, st.Homepage, st.Logo,
		normalizeGenres(st.Genres), st.Language, st.Country, st.City, st.CountryCode, tags,
		st.Votes, st.ClickCount, st.ReliabilityScore,
		st.IsActive,
	).Scan(&id)
	if err != nil {
		return "", err
	}
	return id, nil
}

// CreateManual inserts a new station from admin input and returns the created row.
func (s *StationStore) CreateManual(ctx context.Context, in ManualStationInput) (*Station, error) {
	if in.Status == "" {
		in.Status = "approved"
	}
	tags := normalizeTags(in.Tags)
	styleTags := normalizeTags(in.StyleTags)
	formatTags := normalizeTags(in.FormatTags)
	textureTags := normalizeTags(in.TextureTags)

	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO stations (
			external_id, name, stream_url, homepage, logo,
			genres, language, country, city, country_code, tags,
			style_tags, format_tags, texture_tags,
			votes, click_count, reliability_score,
			is_active, featured, status, overview,
			last_editor_action_at, last_synced_at, updated_at
		) VALUES (
			'manual:' || gen_random_uuid()::text,
			$1, $2, $3, $4,
			$5, $6, $7, $8, $9, $10,
			$11, $12, $13,
			0, 0, $14,
			true, $15, $16, $17,
			NOW(), NOW(), NOW()
		)
		RETURNING id`,
		in.Name, in.StreamURL, in.Homepage, in.Logo,
		normalizeGenres(in.Genres), in.Language, in.Country, in.City, in.CountryCode, tags,
		styleTags, formatTags, textureTags,
		in.ReliabilityScore,
		in.Featured, in.Status, in.Overview,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("create manual station: %w", err)
	}

	st, err := s.GetByIDAdmin(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get created manual station: %w", err)
	}
	return st, nil
}

// UpdateEnrichment saves editable station fields for a station.
func (s *StationStore) UpdateEnrichment(ctx context.Context, id string, u EnrichmentUpdate) error {
	tags := normalizeTags(u.Tags)
	styleTags := normalizeTags(u.StyleTags)
	formatTags := normalizeTags(u.FormatTags)
	textureTags := normalizeTags(u.TextureTags)

	_, err := s.pool.Exec(ctx, `
		UPDATE stations SET
			name              = $1,
			stream_url        = $2,
			homepage          = $3,
			logo              = $4,
			genres            = $5,
			language          = $6,
			country           = $7,
			city              = $8,
			country_code      = $9,
			tags              = $10,
			style_tags            = $11,
			format_tags           = $12,
			texture_tags          = $13,
			reliability_score     = $14,
			status                = $15,
			editor_notes          = $16,
			overview              = $17,
			featured              = $18,
			last_editor_action_at = NOW(),
			updated_at            = NOW()
		WHERE id = $19`,
		u.Name, u.StreamURL, u.Homepage, u.Logo,
		normalizeGenres(u.Genres), u.Language, u.Country, u.City, u.CountryCode, tags,
		styleTags, formatTags, textureTags,
		u.ReliabilityScore,
		u.Status, u.EditorNotes, u.Overview, u.Featured, id,
	)
	return err
}

// UpdateLogo sets the logo field for a station.
func (s *StationStore) UpdateLogo(ctx context.Context, id, logoURL string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE stations SET logo = $1, last_editor_action_at = NOW(), updated_at = NOW() WHERE id = $2`,
		logoURL, id,
	)
	return err
}

// Count returns the total number of stations matching a filter (ignoring Limit/Offset).
func (s *StationStore) Count(ctx context.Context, f StationFilter) (int, error) {
	statusFilter := f.Status
	if statusFilter == "" {
		statusFilter = "approved"
	}

	args := []any{}
	i := 1

	where := fmt.Sprintf("is_active = true AND status = $%d", i)
	args = append(args, statusFilter)
	i++

	if f.Genre != "" {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(genres) g WHERE lower(g) = $%d)", i)
		args = append(args, f.Genre)
		i++
	}
	if f.CountryCode != "" {
		where += fmt.Sprintf(" AND upper(country_code) = $%d", i)
		args = append(args, f.CountryCode)
		i++
	}
	if f.Language != "" {
		where += fmt.Sprintf(" AND lower(language) = $%d", i)
		args = append(args, f.Language)
		i++
	}
	if f.MinBitrate > 0 {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM station_streams WHERE station_id = stations.id AND bitrate >= $%d)", i)
		args = append(args, f.MinBitrate)
		i++
	}
	if f.Style != "" {
		where += fmt.Sprintf(" AND $%d = ANY(style_tags)", i)
		args = append(args, f.Style)
		i++
	}
	if f.Format != "" {
		where += fmt.Sprintf(" AND $%d = ANY(format_tags)", i)
		args = append(args, f.Format)
		i++
	}
	if f.Texture != "" {
		where += fmt.Sprintf(" AND $%d = ANY(texture_tags)", i)
		args = append(args, f.Texture)
		i++
	}
	if f.FeaturedOnly {
		where += " AND featured = true"
	}

	trimmedSearch := strings.TrimSpace(f.Search)
	var searchClauses []string
	if trimmedSearch != "" {
		for _, term := range strings.Fields(trimmedSearch) {
			pattern := "%" + term + "%"
			searchClauses = append(searchClauses, fmt.Sprintf(`
				(
					name ILIKE $%[1]d OR
					EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE $%[2]d) OR
					language ILIKE $%[3]d OR
					country ILIKE $%[4]d OR
					city ILIKE $%[5]d OR
					country_code ILIKE $%[6]d OR
					EXISTS (
						SELECT 1
						FROM unnest(tags) AS tag
						WHERE tag ILIKE $%[7]d
					)
				)`, i, i+1, i+2, i+3, i+4, i+5, i+6))
			args = append(args, pattern, pattern, pattern, pattern, pattern, pattern, pattern)
			i += 7
		}
	}

	searchClause := ""
	if len(searchClauses) > 0 {
		searchClause = " AND " + strings.Join(searchClauses, " AND ")
	}

	var n int
	err := s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM stations WHERE %s%s`, where, searchClause),
		args...,
	).Scan(&n)
	return n, err
}

// CountByStatus returns the number of active stations with the given status.
func (s *StationStore) CountByStatus(ctx context.Context, status string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM stations WHERE is_active = true AND status = $1`, status,
	).Scan(&n)
	return n, err
}

// BulkUpdateStatus sets the status for a list of station IDs.
// Returns the number of rows updated.
func (s *StationStore) BulkUpdateStatus(ctx context.Context, ids []string, status string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	// Build $1,$2,... placeholders starting at $2 (status is $1).
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids)+1)
	args[0] = status
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+2)
		args[i+1] = id
	}
	q := fmt.Sprintf(
		`UPDATE stations SET status = $1, updated_at = NOW() WHERE id IN (%s)`,
		strings.Join(placeholders, ","),
	)
	tag, err := s.pool.Exec(ctx, q, args...)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// Genres returns the distinct non-empty genres present in approved stations.
func (s *StationStore) Genres(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT lower(g) FROM stations, unnest(genres) g
		WHERE is_active = true AND status = 'approved' AND g != ''
		ORDER BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var genres []string
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			return nil, err
		}
		genres = append(genres, g)
	}
	return genres, rows.Err()
}

// Countries returns distinct country codes + names present in approved stations.
func (s *StationStore) Countries(ctx context.Context) ([][2]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT upper(country_code), country FROM stations
		WHERE is_active = true AND status = 'approved' AND country_code != ''
		ORDER BY 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result [][2]string
	for rows.Next() {
		var code, name string
		if err := rows.Scan(&code, &name); err != nil {
			return nil, err
		}
		result = append(result, [2]string{code, name})
	}
	return result, rows.Err()
}

// Languages returns distinct non-empty languages present in approved stations.
func (s *StationStore) Languages(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT lower(language) FROM stations
		WHERE is_active = true AND status = 'approved' AND language != ''
		ORDER BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var languages []string
	for rows.Next() {
		var language string
		if err := rows.Scan(&language); err != nil {
			return nil, err
		}
		languages = append(languages, language)
	}
	return languages, rows.Err()
}

// Styles returns distinct non-empty style tags present in approved stations.
func (s *StationStore) Styles(ctx context.Context) ([]string, error) {
	return s.distinctTagValues(ctx, "style_tags")
}

// Formats returns distinct non-empty format tags present in approved stations.
func (s *StationStore) Formats(ctx context.Context) ([]string, error) {
	return s.distinctTagValues(ctx, "format_tags")
}

// Textures returns distinct non-empty texture tags present in approved stations.
func (s *StationStore) Textures(ctx context.Context) ([]string, error) {
	return s.distinctTagValues(ctx, "texture_tags")
}

func (s *StationStore) distinctTagValues(ctx context.Context, column string) ([]string, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT DISTINCT tag FROM stations, unnest(%s) AS tag
		WHERE is_active = true AND status = 'approved'
		ORDER BY 1`, column))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var values []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		values = append(values, v)
	}
	return values, rows.Err()
}
