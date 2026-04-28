package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	MediaAssetOwnerUser    = "user"
	MediaAssetOwnerStation = "station"

	MediaAssetKindAvatar      = "avatar"
	MediaAssetKindStationIcon = "station_icon"

	MediaAssetStatusPending  = "pending"
	MediaAssetStatusReady    = "ready"
	MediaAssetStatusRejected = "rejected"
)

// MediaAsset holds a row from the media_assets table.
type MediaAsset struct {
	ID                 string
	OwnerType          string
	OwnerID            string
	Kind               string
	StorageKeyOriginal string
	Variants           map[string]string
	MIMEType           string
	Width              *int
	Height             *int
	ByteSize           *int64
	ContentHash        *string
	Status             string
	RejectionReason    *string
}

// MediaAssetAdminSummary contains media pipeline metrics for the admin overview.
type MediaAssetAdminSummary struct {
	Total    int
	Ready    int
	Pending  int
	Rejected int
	Bytes    int64
}

// MediaAssetAdminDetailedSummary extends the overview summary with per-kind
// breakdowns, storage stats, and content-hash integrity coverage.
type MediaAssetAdminDetailedSummary struct {
	Total            int
	Ready            int
	Pending          int
	Rejected         int
	TotalBytes       int64
	AvatarTotal      int
	AvatarBytes      int64
	StationIconTotal int
	StationIconBytes int64
	AvgReadyBytes    int64
	HashCovered      int
	LatestCreatedAt  *time.Time
	LatestReadyAt    *time.Time
}

// CreateMediaAssetParams contains fields for creating a pending media asset row.
type CreateMediaAssetParams struct {
	OwnerType          string
	OwnerID            string
	Kind               string
	StorageKeyOriginal string
	MIMEType           string
}

// MarkMediaAssetReadyParams contains fields for transitioning an asset to ready.
type MarkMediaAssetReadyParams struct {
	Variants    map[string]string
	MIMEType    string
	Width       int
	Height      int
	ByteSize    int64
	ContentHash *string
}

// MediaAssetStore executes queries against the media_assets table.
type MediaAssetStore struct {
	pool *pgxpool.Pool
}

// NewMediaAssetStore creates a MediaAssetStore backed by the given pool.
func NewMediaAssetStore(pool *pgxpool.Pool) *MediaAssetStore {
	return &MediaAssetStore{pool: pool}
}

// AdminSummary returns media-asset pipeline aggregates for the admin overview.
func (s *MediaAssetStore) AdminSummary(ctx context.Context) (*MediaAssetAdminSummary, error) {
	var summary MediaAssetAdminSummary
	err := s.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE status = 'ready')::int,
			COUNT(*) FILTER (WHERE status = 'pending')::int,
			COUNT(*) FILTER (WHERE status = 'rejected')::int,
			COALESCE(SUM(byte_size), 0)::bigint
		FROM media_assets`,
	).Scan(&summary.Total, &summary.Ready, &summary.Pending, &summary.Rejected, &summary.Bytes)
	if err != nil {
		return nil, fmt.Errorf("admin media asset summary: %w", err)
	}
	return &summary, nil
}

// AdminDetailedSummary returns extended media-asset pipeline aggregates for the
// admin media diagnostics page. All byte counts reflect ready assets only since
// pending and rejected rows do not have a stored byte_size.
func (s *MediaAssetStore) AdminDetailedSummary(ctx context.Context) (*MediaAssetAdminDetailedSummary, error) {
	var summary MediaAssetAdminDetailedSummary
	err := s.pool.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE status = 'ready')::int,
			COUNT(*) FILTER (WHERE status = 'pending')::int,
			COUNT(*) FILTER (WHERE status = 'rejected')::int,
			COALESCE(SUM(byte_size) FILTER (WHERE status = 'ready'), 0)::bigint,
			COUNT(*) FILTER (WHERE kind = 'avatar')::int,
			COALESCE(SUM(byte_size) FILTER (WHERE kind = 'avatar' AND status = 'ready'), 0)::bigint,
			COUNT(*) FILTER (WHERE kind = 'station_icon')::int,
			COALESCE(SUM(byte_size) FILTER (WHERE kind = 'station_icon' AND status = 'ready'), 0)::bigint,
			COALESCE(AVG(byte_size) FILTER (WHERE status = 'ready'), 0)::bigint,
			COUNT(*) FILTER (WHERE content_hash IS NOT NULL AND status = 'ready')::int,
			MAX(created_at),
			MAX(updated_at) FILTER (WHERE status = 'ready')
		FROM media_assets`,
	).Scan(
		&summary.Total,
		&summary.Ready,
		&summary.Pending,
		&summary.Rejected,
		&summary.TotalBytes,
		&summary.AvatarTotal,
		&summary.AvatarBytes,
		&summary.StationIconTotal,
		&summary.StationIconBytes,
		&summary.AvgReadyBytes,
		&summary.HashCovered,
		&summary.LatestCreatedAt,
		&summary.LatestReadyAt,
	)
	if err != nil {
		return nil, fmt.Errorf("admin media asset detailed summary: %w", err)
	}
	return &summary, nil
}

const mediaAssetColumns = `
	id, owner_type, owner_id, kind, storage_key_original, variants,
	mime_type, width, height, byte_size, content_hash,
	status, rejection_reason`

func scanMediaAsset(row pgx.Row) (*MediaAsset, error) {
	var a MediaAsset
	var variantsRaw []byte

	err := row.Scan(
		&a.ID,
		&a.OwnerType,
		&a.OwnerID,
		&a.Kind,
		&a.StorageKeyOriginal,
		&variantsRaw,
		&a.MIMEType,
		&a.Width,
		&a.Height,
		&a.ByteSize,
		&a.ContentHash,
		&a.Status,
		&a.RejectionReason,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	a.Variants = map[string]string{}
	if len(variantsRaw) > 0 {
		if err := json.Unmarshal(variantsRaw, &a.Variants); err != nil {
			return nil, fmt.Errorf("decode variants: %w", err)
		}
	}

	return &a, nil
}

func validateOwnerType(ownerType string) error {
	switch ownerType {
	case MediaAssetOwnerUser, MediaAssetOwnerStation:
		return nil
	default:
		return fmt.Errorf("invalid owner type: %q", ownerType)
	}
}

func validateKind(kind string) error {
	switch kind {
	case MediaAssetKindAvatar, MediaAssetKindStationIcon:
		return nil
	default:
		return fmt.Errorf("invalid asset kind: %q", kind)
	}
}

// pendingAssetTTL is how long a pending asset row survives before the cleaner
// removes it. It intentionally exceeds the 15-minute upload-token TTL so a
// slow-but-valid upload is not evicted mid-flight.
const pendingAssetTTL = 20 * time.Minute

// ExpiredPendingAsset is a row deleted by DeleteExpiredPending. It carries
// the storage key so the caller can purge any uploaded blob.
type ExpiredPendingAsset struct {
	ID                 string
	StorageKeyOriginal string
}

// CreatePending inserts a pending media asset row with an expiry deadline
// after which the background cleaner will remove it if never completed.
func (s *MediaAssetStore) CreatePending(ctx context.Context, p CreateMediaAssetParams) (*MediaAsset, error) {
	if err := validateOwnerType(p.OwnerType); err != nil {
		return nil, err
	}
	if err := validateKind(p.Kind); err != nil {
		return nil, err
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO media_assets (owner_type, owner_id, kind, storage_key_original, mime_type, status, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW() + $7::interval)
		 RETURNING `+mediaAssetColumns,
		p.OwnerType,
		p.OwnerID,
		p.Kind,
		p.StorageKeyOriginal,
		p.MIMEType,
		MediaAssetStatusPending,
		pendingAssetTTL.String(),
	)

	a, err := scanMediaAsset(row)
	if err != nil {
		return nil, fmt.Errorf("create media asset: %w", err)
	}
	return a, nil
}

// DeleteExpiredPending hard-deletes pending rows whose expires_at has passed
// and returns the deleted rows so the caller can clean up any uploaded blobs.
func (s *MediaAssetStore) DeleteExpiredPending(ctx context.Context) ([]ExpiredPendingAsset, error) {
	rows, err := s.pool.Query(ctx, `
		DELETE FROM media_assets
		WHERE status = 'pending'
		  AND (
		    (expires_at IS NOT NULL AND expires_at < NOW())
		    OR (expires_at IS NULL AND created_at < NOW() - $1::interval)
		  )
		RETURNING id, storage_key_original`,
		pendingAssetTTL.String())
	if err != nil {
		return nil, fmt.Errorf("delete expired pending media assets: %w", err)
	}
	defer rows.Close()

	var result []ExpiredPendingAsset
	for rows.Next() {
		var a ExpiredPendingAsset
		if err := rows.Scan(&a.ID, &a.StorageKeyOriginal); err != nil {
			return nil, fmt.Errorf("scan expired pending asset: %w", err)
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

// GetByID fetches a media asset by UUID.
func (s *MediaAssetStore) GetByID(ctx context.Context, id string) (*MediaAsset, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+mediaAssetColumns+` FROM media_assets WHERE id = $1`, id)

	a, err := scanMediaAsset(row)
	if err != nil {
		return nil, fmt.Errorf("get media asset: %w", err)
	}
	return a, nil
}

// GetLatestByOwnerAndKind fetches the latest asset for an owner/kind pair.
func (s *MediaAssetStore) GetLatestByOwnerAndKind(ctx context.Context, ownerType, ownerID, kind string) (*MediaAsset, error) {
	if err := validateOwnerType(ownerType); err != nil {
		return nil, err
	}
	if err := validateKind(kind); err != nil {
		return nil, err
	}

	row := s.pool.QueryRow(ctx,
		`SELECT `+mediaAssetColumns+`
		 FROM media_assets
		 WHERE owner_type = $1 AND owner_id = $2 AND kind = $3
		 ORDER BY created_at DESC
		 LIMIT 1`,
		ownerType,
		ownerID,
		kind,
	)

	a, err := scanMediaAsset(row)
	if err != nil {
		return nil, fmt.Errorf("get latest media asset: %w", err)
	}
	return a, nil
}

// UpdateStorageKeyOriginal updates the original object key for a media asset.
func (s *MediaAssetStore) UpdateStorageKeyOriginal(ctx context.Context, id, storageKeyOriginal string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE media_assets
		 SET storage_key_original = $1,
		     updated_at = NOW()
		 WHERE id = $2`,
		storageKeyOriginal,
		id,
	)
	if err != nil {
		return fmt.Errorf("update media asset storage key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkReady transitions a media asset to ready with processed metadata.
func (s *MediaAssetStore) MarkReady(ctx context.Context, id string, p MarkMediaAssetReadyParams) error {
	variantsJSON, err := json.Marshal(p.Variants)
	if err != nil {
		return fmt.Errorf("encode variants: %w", err)
	}

	tag, err := s.pool.Exec(ctx,
		`UPDATE media_assets
		 SET variants = $1,
		     mime_type = $2,
		     width = $3,
		     height = $4,
		     byte_size = $5,
		     content_hash = $6,
		     status = $7,
		     rejection_reason = NULL,
		     expires_at = NULL,
		     updated_at = NOW()
		 WHERE id = $8`,
		variantsJSON,
		p.MIMEType,
		p.Width,
		p.Height,
		p.ByteSize,
		p.ContentHash,
		MediaAssetStatusReady,
		id,
	)
	if err != nil {
		return fmt.Errorf("mark media asset ready: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkRejected transitions a media asset to rejected with a reason.
func (s *MediaAssetStore) MarkRejected(ctx context.Context, id, reason string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE media_assets
		 SET status = $1,
		     rejection_reason = $2,
		     expires_at = NULL,
		     updated_at = NOW()
		 WHERE id = $3`,
		MediaAssetStatusRejected,
		reason,
		id,
	)
	if err != nil {
		return fmt.Errorf("mark media asset rejected: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetUserAvatarAsset links the user's avatar_asset_id to a media asset.
func (s *MediaAssetStore) SetUserAvatarAsset(ctx context.Context, userID, assetID string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET avatar_asset_id = $1, updated_at = NOW() WHERE id = $2`,
		assetID,
		userID,
	)
	if err != nil {
		return fmt.Errorf("set user avatar asset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ClearUserAvatarAsset removes the avatar reference from a user.
func (s *MediaAssetStore) ClearUserAvatarAsset(ctx context.Context, userID string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET avatar_asset_id = NULL, updated_at = NOW() WHERE id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("clear user avatar asset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetStationIconAsset links the station's icon_asset_id to a media asset.
func (s *MediaAssetStore) SetStationIconAsset(ctx context.Context, stationID, assetID string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE stations SET icon_asset_id = $1, updated_at = NOW() WHERE id = $2`,
		assetID,
		stationID,
	)
	if err != nil {
		return fmt.Errorf("set station icon asset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ClearStationIconAsset removes the icon reference from a station.
func (s *MediaAssetStore) ClearStationIconAsset(ctx context.Context, stationID string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE stations SET icon_asset_id = NULL, updated_at = NOW() WHERE id = $1`,
		stationID,
	)
	if err != nil {
		return fmt.Errorf("clear station icon asset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
