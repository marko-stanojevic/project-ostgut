package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

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

// CreatePending inserts a pending media asset row.
func (s *MediaAssetStore) CreatePending(ctx context.Context, p CreateMediaAssetParams) (*MediaAsset, error) {
	if err := validateOwnerType(p.OwnerType); err != nil {
		return nil, err
	}
	if err := validateKind(p.Kind); err != nil {
		return nil, err
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO media_assets (owner_type, owner_id, kind, storage_key_original, mime_type, status)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING `+mediaAssetColumns,
		p.OwnerType,
		p.OwnerID,
		p.Kind,
		p.StorageKeyOriginal,
		p.MIMEType,
		MediaAssetStatusPending,
	)

	a, err := scanMediaAsset(row)
	if err != nil {
		return nil, fmt.Errorf("create media asset: %w", err)
	}
	return a, nil
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
