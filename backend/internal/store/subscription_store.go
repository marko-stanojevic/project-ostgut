package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Subscription holds a row from the subscriptions table.
type Subscription struct {
	ID                   string
	UserID               string
	Plan                 string
	Status               string
	TrialEndsAt          *time.Time
	CurrentPeriodEndsAt  *time.Time
	PaddleCustomerID     *string
	PaddleSubscriptionID *string
}

// SubscriptionStore executes queries against the subscriptions table.
type SubscriptionStore struct {
	pool *pgxpool.Pool
}

// NewSubscriptionStore creates a SubscriptionStore backed by the given pool.
func NewSubscriptionStore(pool *pgxpool.Pool) *SubscriptionStore {
	return &SubscriptionStore{pool: pool}
}

// GetByUserID returns the subscription for the given user.
func (s *SubscriptionStore) GetByUserID(ctx context.Context, userID string) (*Subscription, error) {
	var sub Subscription
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, plan, status, trial_ends_at, current_period_ends_at,
		        paddle_customer_id, paddle_subscription_id
		 FROM subscriptions WHERE user_id = $1`,
		userID,
	).Scan(
		&sub.ID, &sub.UserID, &sub.Plan, &sub.Status,
		&sub.TrialEndsAt, &sub.CurrentPeriodEndsAt,
		&sub.PaddleCustomerID, &sub.PaddleSubscriptionID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get subscription: %w", err)
	}
	return &sub, nil
}

// GetByPaddleSubscriptionID returns the subscription matching a Paddle subscription ID.
func (s *SubscriptionStore) GetByPaddleSubscriptionID(ctx context.Context, paddleSubID string) (*Subscription, error) {
	var sub Subscription
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, plan, status, trial_ends_at, current_period_ends_at,
		        paddle_customer_id, paddle_subscription_id
		 FROM subscriptions WHERE paddle_subscription_id = $1`,
		paddleSubID,
	).Scan(
		&sub.ID, &sub.UserID, &sub.Plan, &sub.Status,
		&sub.TrialEndsAt, &sub.CurrentPeriodEndsAt,
		&sub.PaddleCustomerID, &sub.PaddleSubscriptionID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get subscription by paddle id: %w", err)
	}
	return &sub, nil
}

// Upsert updates the subscription for a user from a Paddle webhook payload.
func (s *SubscriptionStore) Upsert(ctx context.Context, userID, plan, status, paddleCustomerID, paddleSubID string, currentPeriodEndsAt *time.Time) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE subscriptions
		 SET plan = $1, status = $2, paddle_customer_id = $3, paddle_subscription_id = $4,
		     current_period_ends_at = $5, updated_at = NOW()
		 WHERE user_id = $6`,
		plan, status, paddleCustomerID, paddleSubID, currentPeriodEndsAt, userID,
	)
	return err
}
