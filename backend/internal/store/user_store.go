// Package store provides database access for user and auth data.
package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
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
	ID           string
	Email        string
	PasswordHash string
	Name         string
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
		`SELECT id, email, COALESCE(password_hash, ''), name FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name)
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
