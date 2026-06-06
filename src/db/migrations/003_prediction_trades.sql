-- =============================================
-- Migration 003: Prediction Trade Recording
-- Run in Supabase SQL Editor
-- =============================================

-- TABLE: prediction_trades
CREATE TABLE IF NOT EXISTS prediction_trades (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  telegram_id      BIGINT NOT NULL,
  username         TEXT,
  proxy_address    TEXT NOT NULL,
  clob_trade_id    TEXT UNIQUE,
  condition_id     TEXT NOT NULL,
  token_id         TEXT NOT NULL,
  outcome          TEXT NOT NULL CHECK (outcome IN ('UP', 'DOWN')),
  side             TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  price            DECIMAL(10,6) NOT NULL,
  shares           DECIMAL(18,6) NOT NULL,
  cost_usdc        DECIMAL(18,6) NOT NULL,
  resolved         BOOLEAN DEFAULT FALSE,
  resolution       TEXT CHECK (resolution IN ('WIN', 'LOSS', 'PUSH')),
  payout_usdc      DECIMAL(18,6),
  pnl_usdc         DECIMAL(18,6),
  claimed          BOOLEAN DEFAULT FALSE,
  claim_tx_hash    TEXT,
  traded_at        TIMESTAMPTZ NOT NULL,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE: prediction_user_stats
CREATE TABLE IF NOT EXISTS prediction_user_stats (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  telegram_id      BIGINT UNIQUE NOT NULL,
  username         TEXT,
  proxy_address    TEXT,
  total_trades     INTEGER DEFAULT 0,
  total_wins       INTEGER DEFAULT 0,
  total_losses     INTEGER DEFAULT 0,
  total_wagered    DECIMAL(18,6) DEFAULT 0,
  total_payout     DECIMAL(18,6) DEFAULT 0,
  realized_pnl     DECIMAL(18,6) DEFAULT 0,
  pending_claims   INTEGER DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE: miniapp_trades (simple leaderboard recording)
CREATE TABLE IF NOT EXISTS miniapp_trades (
  id          BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  amount      DECIMAL(18,6) NOT NULL,
  side        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_pred_trades_telegram   ON prediction_trades(telegram_id);
CREATE INDEX IF NOT EXISTS idx_pred_trades_proxy      ON prediction_trades(proxy_address);
CREATE INDEX IF NOT EXISTS idx_pred_trades_condition  ON prediction_trades(condition_id);
CREATE INDEX IF NOT EXISTS idx_pred_trades_resolved   ON prediction_trades(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_pred_trades_claimable  ON prediction_trades(claimed, resolved) WHERE resolved = TRUE AND claimed = FALSE;
CREATE INDEX IF NOT EXISTS idx_pred_stats_telegram    ON prediction_user_stats(telegram_id);
CREATE INDEX IF NOT EXISTS idx_miniapp_trades_telegram ON miniapp_trades(telegram_id);

-- RLS
ALTER TABLE prediction_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE miniapp_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON prediction_trades FOR ALL USING (true);
CREATE POLICY "Service role full access" ON prediction_user_stats FOR ALL USING (true);
CREATE POLICY "Service role full access" ON miniapp_trades FOR ALL USING (true);

-- Trigger function: Update user stats on trade insert (increment total_trades and total_wagered)
CREATE OR REPLACE FUNCTION trigger_on_prediction_trade_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO prediction_user_stats (
    user_id,
    telegram_id,
    username,
    proxy_address,
    total_trades,
    total_wagered,
    updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.telegram_id,
    NEW.username,
    NEW.proxy_address,
    1,
    NEW.cost_usdc,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    username = COALESCE(NEW.username, prediction_user_stats.username),
    proxy_address = COALESCE(NEW.proxy_address, prediction_user_stats.proxy_address),
    total_trades = prediction_user_stats.total_trades + 1,
    total_wagered = prediction_user_stats.total_wagered + NEW.cost_usdc,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prediction_trades_insert
AFTER INSERT ON prediction_trades
FOR EACH ROW
EXECUTE FUNCTION trigger_on_prediction_trade_insert();

-- Trigger function: Update pending_claims when claimed goes from FALSE to TRUE
CREATE OR REPLACE FUNCTION trigger_on_prediction_trade_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.claimed = FALSE AND NEW.claimed = TRUE AND NEW.resolution = 'WIN' THEN
    UPDATE prediction_user_stats
    SET pending_claims = GREATEST(0, pending_claims - 1),
        updated_at = NOW()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prediction_trades_update
AFTER UPDATE ON prediction_trades
FOR EACH ROW
EXECUTE FUNCTION trigger_on_prediction_trade_update();

-- RPC function to update user stats on resolution
CREATE OR REPLACE FUNCTION update_prediction_user_stats(
  p_user_id UUID,
  p_telegram_id BIGINT,
  p_username TEXT,
  p_proxy_address TEXT,
  p_is_win BOOLEAN,
  p_is_loss BOOLEAN,
  p_payout NUMERIC,
  p_pending_delta INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO prediction_user_stats (
    user_id,
    telegram_id,
    username,
    proxy_address,
    total_trades,
    total_wins,
    total_losses,
    total_wagered,
    total_payout,
    realized_pnl,
    pending_claims,
    updated_at
  )
  VALUES (
    p_user_id,
    p_telegram_id,
    p_username,
    p_proxy_address,
    0,
    CASE WHEN p_is_win THEN 1 ELSE 0 END,
    CASE WHEN p_is_loss THEN 1 ELSE 0 END,
    0,
    p_payout,
    0,
    p_pending_delta,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    username = COALESCE(p_username, prediction_user_stats.username),
    proxy_address = COALESCE(p_proxy_address, prediction_user_stats.proxy_address),
    total_wins = prediction_user_stats.total_wins + CASE WHEN p_is_win THEN 1 ELSE 0 END,
    total_losses = prediction_user_stats.total_losses + CASE WHEN p_is_loss THEN 1 ELSE 0 END,
    total_payout = prediction_user_stats.total_payout + p_payout,
    pending_claims = prediction_user_stats.pending_claims + p_pending_delta,
    updated_at = NOW();

  -- Recalculate realized_pnl based on all resolved trades for the user
  UPDATE prediction_user_stats
  SET realized_pnl = (
    SELECT COALESCE(SUM(pnl_usdc), 0)
    FROM prediction_trades
    WHERE user_id = p_user_id AND resolved = TRUE
  )
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
