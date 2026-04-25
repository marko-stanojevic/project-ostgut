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

// ErrDuplicateStationName is returned when a write would cause two
// approved-and-active stations to share the same case- and whitespace-
// insensitive name. Enforced by the partial unique index
// stations_approved_name_idx.
var ErrDuplicateStationName = errors.New("station name already in use among approved stations")

// translateStationWriteErr maps Postgres unique-violation errors on the
// stations table to typed sentinels. Callers use errors.Is to branch.
func translateStationWriteErr(err error) error {
	if err == nil {
		return nil
	}
	if uniqueViolationConstraint(err) == "stations_approved_name_idx" {
		return ErrDuplicateStationName
	}
	return err
}

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
	Genres       []string // OR filter across genres array
	Country      string
	Language     string
	MinBitrate   int
	Styles       []string // OR filter across style_tags
	Formats      []string // OR filter across format_tags
	Textures     []string // OR filter across texture_tags
	Search       string
	Sort         string // "popular" = click_count DESC
	FeaturedOnly bool
	Status       string // empty = approved only (public default)
	Limit        int
	Offset       int
}

// EnrichmentUpdate carries editable station fields for admin updates.
type EnrichmentUpdate struct {
	Name        string
	StreamURL   string
	Homepage    string
	Logo        string
	Genres      []string
	Language    string
	Country     string
	City        string
	Tags        []string
	StyleTags   []string
	FormatTags  []string
	TextureTags []string
	Status      string
	Overview    *string
	EditorNotes *string
	Featured    bool
}

// ManualStationInput carries fields for creating a station directly from admin.
type ManualStationInput struct {
	Name        string
	StreamURL   string
	Homepage    string
	Logo        string
	Genres      []string
	Language    string
	Country     string
	City        string
	Tags        []string
	StyleTags   []string
	FormatTags  []string
	TextureTags []string
	Status      string
	Featured    bool
	Overview    *string
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
	genres, language, country, city, tags,
	style_tags, format_tags, texture_tags,
	votes, click_count, reliability_score,
	is_active, featured, status,
	custom_website, overview, editor_notes,
	last_checked_at, last_synced_at`

func scanStation(row pgx.Row) (*Station, error) {
	var s Station
	err := row.Scan(
		&s.ID, &s.ExternalID, &s.Name, &s.CustomName, &s.StreamURL, &s.Homepage, &s.Logo,
		&s.Genres, &s.Language, &s.Country, &s.City, &s.Tags,
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

type stationQueryParts struct {
	where        string
	searchClause string
	orderClause  string
	args         []any
	countArgs    []any // args for COUNT query (excludes ORDER BY args)
}

type stationQueryBuilder struct {
	args    []any
	nextArg int
}

func buildStationQueryParts(f StationFilter) stationQueryParts {
	statusFilter := f.Status
	if statusFilter == "" {
		statusFilter = "approved"
	}

	builder := &stationQueryBuilder{
		args:    []any{statusFilter},
		nextArg: 2,
	}

	where, searchClause := buildStationFilterClause(f, builder)
	countArgs := append([]any{}, builder.args...)
	orderClause := buildStationOrderClause(f, builder)

	return stationQueryParts{
		where:        where,
		searchClause: searchClause,
		orderClause:  orderClause,
		args:         builder.args,
		countArgs:    countArgs,
	}
}

func (b *stationQueryBuilder) addArg(value any) int {
	placeholder := b.nextArg
	b.args = append(b.args, value)
	b.nextArg++
	return placeholder
}

func buildStationFilterClause(f StationFilter, builder *stationQueryBuilder) (string, string) {
	where := "is_active = true AND status = $1"

	if len(f.Genres) > 0 {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(genres) g WHERE lower(g) = ANY($%d))", builder.addArg(f.Genres))
	}
	if f.Country != "" {
		where += fmt.Sprintf(" AND lower(country) = $%d", builder.addArg(f.Country))
	}
	if f.Language != "" {
		where += fmt.Sprintf(" AND lower(language) = $%d", builder.addArg(f.Language))
	}
	if f.MinBitrate > 0 {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM station_streams WHERE station_id = stations.id AND bitrate >= $%d)", builder.addArg(f.MinBitrate))
	}
	if len(f.Styles) > 0 {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(style_tags) t WHERE lower(t) = ANY($%d))", builder.addArg(f.Styles))
	}
	if len(f.Formats) > 0 {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(format_tags) t WHERE lower(t) = ANY($%d))", builder.addArg(f.Formats))
	}
	if len(f.Textures) > 0 {
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(texture_tags) t WHERE lower(t) = ANY($%d))", builder.addArg(f.Textures))
	}
	if f.FeaturedOnly {
		where += " AND featured = true"
	}

	trimmedSearch := strings.TrimSpace(f.Search)
	var searchClauses []string
	if trimmedSearch != "" {
		for _, term := range strings.Fields(trimmedSearch) {
			pattern := "%" + term + "%"
			namePlaceholder := builder.addArg(pattern)
			genrePlaceholder := builder.addArg(pattern)
			languagePlaceholder := builder.addArg(pattern)
			countryPlaceholder := builder.addArg(pattern)
			cityPlaceholder := builder.addArg(pattern)
			tagPlaceholder := builder.addArg(pattern)

			searchClauses = append(searchClauses, fmt.Sprintf(`
				(
					name ILIKE $%[1]d OR
					EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE $%[2]d) OR
					language ILIKE $%[3]d OR
					country ILIKE $%[4]d OR
					city ILIKE $%[5]d OR
					EXISTS (
						SELECT 1
						FROM unnest(tags) AS tag
						WHERE tag ILIKE $%[6]d
					)
				)`, namePlaceholder, genrePlaceholder, languagePlaceholder, countryPlaceholder, cityPlaceholder, tagPlaceholder))
		}
	}

	searchClause := ""
	if len(searchClauses) > 0 {
		searchClause = " AND " + strings.Join(searchClauses, " AND ")
	}

	return where, searchClause
}

func buildStationOrderClause(f StationFilter, builder *stationQueryBuilder) string {
	orderClause := "featured DESC, reliability_score DESC"
	if f.Sort == "popular" {
		orderClause = "click_count DESC, reliability_score DESC"
	}

	trimmedSearch := strings.TrimSpace(f.Search)
	if trimmedSearch == "" {
		return orderClause
	}

	exactMatch := strings.ToLower(trimmedSearch)
	prefixMatch := exactMatch + "%"
	containsMatch := "%" + exactMatch + "%"

	exactPlaceholder := builder.addArg(exactMatch)
	prefixPlaceholder := builder.addArg(prefixMatch)
	containsPlaceholder := builder.addArg(containsMatch)
	tagExactPlaceholder := builder.addArg(exactMatch)
	genrePrefixPlaceholder := builder.addArg(prefixMatch)
	cityPrefixPlaceholder := builder.addArg(prefixMatch)
	countryPrefixPlaceholder := builder.addArg(prefixMatch)
	languagePrefixPlaceholder := builder.addArg(prefixMatch)

	return fmt.Sprintf(`
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
			WHEN lower(city) LIKE $%d OR lower(country) LIKE $%d OR lower(language) LIKE $%d THEN 5
			ELSE 6
		END,
		featured DESC,
		reliability_score DESC,
		name ASC`, exactPlaceholder, prefixPlaceholder, containsPlaceholder, tagExactPlaceholder, genrePrefixPlaceholder, cityPrefixPlaceholder, countryPrefixPlaceholder, languagePrefixPlaceholder)
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
	parts := buildStationQueryParts(f)
	args := append(append([]any{}, parts.args...), f.Limit, f.Offset)
	limitClause := fmt.Sprintf("$%d OFFSET $%d", len(parts.args)+1, len(parts.args)+2)

	q := fmt.Sprintf(`
		SELECT %s FROM stations
		WHERE %s%s
		ORDER BY %s
		LIMIT %s`, stationColumns, parts.where, parts.searchClause, parts.orderClause, limitClause)

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

// ListAllByStatus returns all active stations for one moderation status.
func (s *StationStore) ListAllByStatus(ctx context.Context, status string) ([]*Station, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+stationColumns+` FROM stations
		WHERE is_active = true AND status = $1
		ORDER BY featured DESC, reliability_score DESC, name ASC`, status)
	if err != nil {
		return nil, fmt.Errorf("list stations by status: %w", err)
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
			genres, language, country, city, tags,
			votes, click_count, reliability_score,
			is_active, status, last_synced_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',NOW(),NOW()
		)
		ON CONFLICT (external_id) DO UPDATE SET
			votes             = EXCLUDED.votes,
			click_count       = EXCLUDED.click_count,
			reliability_score = EXCLUDED.reliability_score,
			is_active         = EXCLUDED.is_active,
			last_synced_at    = NOW(),
			updated_at        = NOW()
			-- NOTE: name, stream_url, homepage, logo, genres, language,
			-- country, tags, status,
			-- editor_notes, featured are intentionally NOT updated
		RETURNING id`,
		st.ExternalID, st.Name, st.StreamURL, st.Homepage, st.Logo,
		normalizeGenres(st.Genres), st.Language, st.Country, st.City, tags,
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
			genres, language, country, city, tags,
			style_tags, format_tags, texture_tags,
			votes, click_count, reliability_score,
			is_active, featured, status, overview,
			last_editor_action_at, last_synced_at, updated_at
		) VALUES (
			'manual:' || gen_random_uuid()::text,
			$1, $2, $3, $4,
			$5, $6, $7, $8, $9,
			$10, $11, $12,
			0, 0, 0,
			true, $13, $14, $15,
			NOW(), NOW(), NOW()
		)
		RETURNING id`,
		in.Name, in.StreamURL, in.Homepage, in.Logo,
		normalizeGenres(in.Genres), in.Language, in.Country, in.City, tags,
		styleTags, formatTags, textureTags,
		in.Featured, in.Status, in.Overview,
	).Scan(&id)
	if err != nil {
		if terr := translateStationWriteErr(err); errors.Is(terr, ErrDuplicateStationName) {
			return nil, terr
		}
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
			tags              = $9,
			style_tags        = $10,
			format_tags       = $11,
			texture_tags      = $12,
			status            = $13,
			editor_notes      = $14,
			overview          = $15,
			featured          = $16,
			last_editor_action_at = NOW(),
			updated_at            = NOW()
		WHERE id = $17`,
		u.Name, u.StreamURL, u.Homepage, u.Logo,
		normalizeGenres(u.Genres), u.Language, u.Country, u.City, tags,
		styleTags, formatTags, textureTags,
		u.Status, u.EditorNotes, u.Overview, u.Featured, id,
	)
	return translateStationWriteErr(err)
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
	parts := buildStationQueryParts(f)

	var n int
	err := s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM stations WHERE %s%s`, parts.where, parts.searchClause),
		parts.countArgs...,
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
		return 0, translateStationWriteErr(err)
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
