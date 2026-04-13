CREATE TABLE subscriptions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                      TEXT        NOT NULL DEFAULT 'free',   -- free | pro
  status                    TEXT        NOT NULL DEFAULT 'trialing', -- trialing | active | past_due | canceled | paused
  trial_ends_at             TIMESTAMPTZ,
  current_period_ends_at    TIMESTAMPTZ,
  paddle_customer_id        TEXT,
  paddle_subscription_id    TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX subscriptions_user_id_idx ON subscriptions (user_id);

-- Auto-create a trial subscription for every new user.
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan, status, trial_ends_at)
  VALUES (NEW.id, 'free', 'trialing', NOW() + INTERVAL '14 days');
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION create_trial_subscription();
