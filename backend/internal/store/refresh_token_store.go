package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DefaultRefreshTokenTTL is the lifetime of a freshly issued refresh token.
const DefaultRefreshTokenTTL = 30 * 24 * time.Hour

// ErrRefreshTokenInvalid is returned when a refresh token is unknown, expired,
// or already revoked. Callers should respond with 401 and force re-auth.
var ErrRefreshTokenInvalid = errors.New("refresh token invalid")

// RefreshTokenIssue holds the raw secret returned to the client and the
// expiry persisted in the database.
type RefreshTokenIssue struct {
	Token     string
	ExpiresAt time.Time
}

// refreshExecer is the subset of pgxpool.Pool and pgx.Tx used to insert a
// refresh token row. Both types satisfy this interface.
type refreshExecer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// RefreshTokenStore manages the refresh_tokens table.
type RefreshTokenStore struct {
	pool *pgxpool.Pool
}

// NewRefreshTokenStore creates a RefreshTokenStore backed by the given pool.
func NewRefreshTokenStore(pool *pgxpool.Pool) *RefreshTokenStore {
	return &RefreshTokenStore{pool: pool}
}

// Issue generates a fresh refresh token for the user and stores its hash.
func (s *RefreshTokenStore) Issue(ctx context.Context, userID string, ttl time.Duration) (*RefreshTokenIssue, error) {
	if ttl <= 0 {
		ttl = DefaultRefreshTokenTTL
	}
	raw, err := generateRefreshToken()
	if err != nil {
		return nil, err
	}
	expiresAt := time.Now().Add(ttl)
	if err := insertRefreshToken(ctx, s.pool, userID, raw, expiresAt); err != nil {
		return nil, err
	}
	return &RefreshTokenIssue{Token: raw, ExpiresAt: expiresAt}, nil
}

// Rotate atomically revokes the supplied token and issues a fresh one for the
// same user. Returns the user_id (so the caller can re-read the role) and
// the new token.
func (s *RefreshTokenStore) Rotate(ctx context.Context, oldToken string, ttl time.Duration) (userID string, issue *RefreshTokenIssue, err error) {
	if ttl <= 0 {
		ttl = DefaultRefreshTokenTTL
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", nil, fmt.Errorf("begin refresh tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Atomically revoke the supplied token. The WHERE clause enforces the
	// token is currently valid (not expired, not revoked); RETURNING returns
	// no rows when the token is invalid.
	err = tx.QueryRow(ctx,
		`UPDATE refresh_tokens
		 SET revoked_at = NOW()
		 WHERE token_hash = $1
		   AND revoked_at IS NULL
		   AND expires_at > NOW()
		 RETURNING user_id`,
		hashToken(oldToken),
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrRefreshTokenInvalid
	}
	if err != nil {
		return "", nil, fmt.Errorf("revoke old refresh token: %w", err)
	}

	raw, err := generateRefreshToken()
	if err != nil {
		return "", nil, err
	}
	expiresAt := time.Now().Add(ttl)
	if err := insertRefreshToken(ctx, tx, userID, raw, expiresAt); err != nil {
		return "", nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", nil, fmt.Errorf("commit refresh tx: %w", err)
	}

	return userID, &RefreshTokenIssue{Token: raw, ExpiresAt: expiresAt}, nil
}

// Revoke marks a refresh token as revoked. Idempotent — unknown or already
// revoked tokens return nil. Used by the logout endpoint.
func (s *RefreshTokenStore) Revoke(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE refresh_tokens
		 SET revoked_at = NOW()
		 WHERE token_hash = $1 AND revoked_at IS NULL`,
		hashToken(token),
	)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// RevokeAllForUser revokes every active refresh token for the given user.
// Useful for "sign out everywhere" and after sensitive role/password changes.
func (s *RefreshTokenStore) RevokeAllForUser(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE refresh_tokens
		 SET revoked_at = NOW()
		 WHERE user_id = $1 AND revoked_at IS NULL`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("revoke user refresh tokens: %w", err)
	}
	return nil
}

func insertRefreshToken(ctx context.Context, q refreshExecer, userID, rawToken string, expiresAt time.Time) error {
	_, err := q.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, hashToken(rawToken), expiresAt,
	)
	if err != nil {
		return fmt.Errorf("insert refresh token: %w", err)
	}
	return nil
}

func generateRefreshToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate refresh token: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
