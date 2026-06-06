-- Track lead trader opt-in in stats
ALTER TABLE prediction_user_stats ADD COLUMN IF NOT EXISTS allow_copy_trading BOOLEAN DEFAULT FALSE;

-- Connections table
CREATE TABLE IF NOT EXISTS copy_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  copier_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  copier_telegram_id  BIGINT NOT NULL,
  lead_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_telegram_id    BIGINT NOT NULL,
  amount_type         TEXT NOT NULL CHECK (amount_type IN ('FIXED', 'PROPORTIONAL')),
  amount_value        DECIMAL(18,6) NOT NULL, -- Fixed USD value (e.g. 5.0) or multiplier (e.g. 1.0)
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(copier_user_id, lead_user_id)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS copy_trade_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  copier_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_trade_id       UUID NOT NULL REFERENCES prediction_trades(id) ON DELETE CASCADE,
  copier_trade_id     UUID, -- References copier's row in prediction_trades
  status              TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
  error_message       TEXT,
  amount_wagered      DECIMAL(18,6),
  executed_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copy_conn_lead ON copy_connections(lead_user_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_copy_logs_copier ON copy_trade_logs(copier_user_id);
