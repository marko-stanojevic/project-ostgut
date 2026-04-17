// Package store provides database access for user and auth data.
package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Sentinel errors returned by the store.
var (
	ErrNotFound   = errors.New("not found")
	ErrEmailTaken = errors.New("email already in use")
	ErrBadToken   = errors.New("invalid or expired token")
)

// User holds a row from the users table.
type User struct {
	ID            string
	Email         string
	PasswordHash  string
	Name          string
	IsAdmin       bool
	AvatarAssetID *string
}

// PlayerStation is the persisted station snapshot used for player resume.
type PlayerStation struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	StreamURL   string `json:"streamUrl"`
	Logo        string `json:"logo,omitempty"`
	Genre       string `json:"genre"`
	Country     string `json:"country"`
	City        string `json:"city,omitempty"`
	CountryCode string `json:"countryCode"`
	Bitrate     int    `json:"bitrate"`
	Codec       string `json:"codec"`
}

// PlayerPreferences stores user-level player state for cross-device continuity.
type PlayerPreferences struct {
	Volume    float64
	Station   *PlayerStation
	UpdatedAt time.Time
}

// UserStore executes queries against the users and password_reset_tokens tables.
type UserStore struct {
	pool *pgxpool.Pool
}

// NewUserStore creates a UserStore backed by the given pool.
func NewUserStore(pool *pgxpool.Pool) *UserStore {
	return &UserStore{pool: pool}
}

// Create inserts a new user with a bcrypt-hashed password.
func (s *UserStore) Create(ctx context.Context, email, password string) (*User, error) {
	email = normalizeEmail(email)

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	var u User
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash)
		 VALUES ($1, $2)
		 RETURNING id, email, password_hash, name`,
		email, string(hash),
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return &u, nil
}

// GetByEmail fetches a user by email address.
func (s *UserStore) GetByEmail(ctx context.Context, email string) (*User, error) {
	email = normalizeEmail(email)

	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, COALESCE(password_hash, ''), name FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

// GetByID fetches a user by UUID.
func (s *UserStore) GetByID(ctx context.Context, id string) (*User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, COALESCE(password_hash, ''), name, is_admin, avatar_asset_id FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.IsAdmin, &u.AvatarAssetID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

// UpsertOAuthUser finds or creates a user for an OAuth sign-in.
//
// Lookup order:
//  1. Existing row matching (oauth_provider, oauth_provider_id) — return it.
//  2. Existing row matching email — link the OAuth identity and return it.
//  3. No match — create a new password-less user.
func (s *UserStore) UpsertOAuthUser(ctx context.Context, provider, providerID, email, name string) (*User, error) {
	email = normalizeEmail(email)

	var u User

	// 1. Already linked
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, COALESCE(password_hash, ''), name
		 FROM users WHERE oauth_provider = $1 AND oauth_provider_id = $2`,
		provider, providerID,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name)
	if err == nil {
		return &u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("lookup oauth user: %w", err)
	}

	// 2. Link to existing email account
	err = s.pool.QueryRow(ctx,
		`UPDATE users SET oauth_provider = $1, oauth_provider_id = $2, updated_at = NOW()
		 WHERE email = $3
		 RETURNING id, email, COALESCE(password_hash, ''), name`,
		provider, providerID, email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name)
	if err == nil {
		return &u, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("link oauth user: %w", err)
	}

	// 3. Create new OAuth-only user
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, name, oauth_provider, oauth_provider_id)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email, COALESCE(password_hash, ''), name`,
		email, name, provider, providerID,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("create oauth user: %w", err)
	}
	return &u, nil
}

// ListUsers returns a paginated list of users ordered by creation date.
func (s *UserStore) ListUsers(ctx context.Context, limit, offset int) ([]*User, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, email, COALESCE(name,''), is_admin FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.IsAdmin); err != nil {
			return nil, 0, err
		}
		users = append(users, &u)
	}
	return users, total, rows.Err()
}

// UpdateName updates the display name of a user.
func (s *UserStore) UpdateName(ctx context.Context, id, name string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`,
		name, id,
	)
	if err != nil {
		return fmt.Errorf("update name: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetPlayerPreferences fetches persisted player preferences for a user.
func (s *UserStore) GetPlayerPreferences(ctx context.Context, id string) (*PlayerPreferences, error) {
	var prefs PlayerPreferences
	var stationRaw []byte

	err := s.pool.QueryRow(ctx,
		`SELECT player_volume, player_last_station, player_prefs_updated_at FROM users WHERE id = $1`,
		id,
	).Scan(&prefs.Volume, &stationRaw, &prefs.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get player preferences: %w", err)
	}

	if len(stationRaw) > 0 {
		var station PlayerStation
		if err := json.Unmarshal(stationRaw, &station); err != nil {
			return nil, fmt.Errorf("unmarshal player station: %w", err)
		}
		prefs.Station = &station
	}

	return &prefs, nil
}

// UpdatePlayerPreferences upserts persisted player preferences for a user.
func (s *UserStore) UpdatePlayerPreferences(ctx context.Context, id string, prefs PlayerPreferences) error {
	var stationRaw []byte
	if prefs.Station != nil {
		b, err := json.Marshal(prefs.Station)
		if err != nil {
			return fmt.Errorf("marshal player station: %w", err)
		}
		stationRaw = b
	}

	tag, err := s.pool.Exec(ctx,
		`UPDATE users
		 SET player_volume = $1,
		     player_last_station = $2,
		     player_prefs_updated_at = $3,
		     updated_at = NOW()
		 WHERE id = $4
		   AND player_prefs_updated_at <= $3`,
		prefs.Volume,
		stationRaw,
		prefs.UpdatedAt,
		id,
	)
	if err != nil {
		return fmt.Errorf("update player preferences: %w", err)
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		existsErr := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, id).Scan(&exists)
		if existsErr != nil {
			return fmt.Errorf("check user exists for player preferences: %w", existsErr)
		}
		if !exists {
			return ErrNotFound
		}

		// Ignore stale updates from older clients/tabs.
		return nil
	}

	return nil
}

// IsAdmin returns true if the user has the is_admin flag set.
func (s *UserStore) IsAdmin(ctx context.Context, userID string) (bool, error) {
	var isAdmin bool
	err := s.pool.QueryRow(ctx,
		`SELECT is_admin FROM users WHERE id = $1`, userID,
	).Scan(&isAdmin)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check admin: %w", err)
	}
	return isAdmin, nil
}

// SetAdmin sets or clears the is_admin flag for a user.
func (s *UserStore) SetAdmin(ctx context.Context, userID string, isAdmin bool) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET is_admin = $1, updated_at = NOW() WHERE id = $2`,
		isAdmin, userID,
	)
	if err != nil {
		return fmt.Errorf("set admin: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CheckPassword returns true if password matches the stored bcrypt hash.
func (s *UserStore) CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// CreateResetToken generates a one-time password reset token valid for 1 hour.
// Returns ErrNotFound if no user with that email exists.
func (s *UserStore) CreateResetToken(ctx context.Context, email string) (token string, err error) {
	u, err := s.GetByEmail(ctx, email)
	if err != nil {
		return "", err
	}

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	token = hex.EncodeToString(b)
	expiresAt := time.Now().Add(time.Hour)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO password_reset_tokens (token, user_id, expires_at)
		 VALUES ($1, $2, $3)`,
		token, u.ID, expiresAt,
	)
	if err != nil {
		return "", fmt.Errorf("store reset token: %w", err)
	}
	return token, nil
}

// ResetPassword validates the token, updates the password, and deletes the token
// atomically. Returns ErrBadToken if the token is missing or expired.
func (s *UserStore) ResetPassword(ctx context.Context, token, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var userID string
	err = tx.QueryRow(ctx,
		`DELETE FROM password_reset_tokens
		 WHERE token = $1 AND expires_at > NOW()
		 RETURNING user_id`,
		token,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrBadToken
	}
	if err != nil {
		return fmt.Errorf("consume reset token: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
		string(hash), userID,
	)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	return tx.Commit(ctx)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
