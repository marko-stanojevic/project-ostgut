// Package authtoken issues and validates the backend's HS256 access tokens.
//
// Access tokens carry the user's id, email, and role. They are signed with
// JWT_SECRET and validated in middleware.AuthMiddleware. The role claim is
// authoritative for authorization decisions — RequireRole reads it directly,
// avoiding a database lookup per request.
package authtoken

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/marko-stanojevic/project-ostgut/backend/internal/store"
)

// DefaultTTL is the lifetime of an issued access token.
const DefaultTTL = time.Hour

// Claims are the JWT claims carried by access tokens.
type Claims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

// Issue mints a signed HS256 access token for the given user.
func Issue(secret string, userID, email string, role store.Role, ttl time.Duration) (string, error) {
	if userID == "" {
		return "", errors.New("authtoken: empty user id")
	}
	if _, err := store.ParseRole(string(role)); err != nil {
		return "", fmt.Errorf("authtoken: %w", err)
	}
	if ttl <= 0 {
		ttl = DefaultTTL
	}

	now := time.Now()
	claims := Claims{
		Sub:   userID,
		Email: email,
		Role:  string(role),
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("authtoken: sign: %w", err)
	}
	return signed, nil
}

// Validate parses and validates an access token. It returns the claims when
// the signature, expiry, subject, and role are all valid.
func Validate(tokenString, secret string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("authtoken: token is invalid")
	}
	if claims.Sub == "" {
		return nil, errors.New("authtoken: missing subject claim")
	}
	if _, err := store.ParseRole(claims.Role); err != nil {
		return nil, fmt.Errorf("authtoken: %w", err)
	}
	return claims, nil
}
