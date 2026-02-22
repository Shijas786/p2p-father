-- =============================================
-- P2PFather Bot — Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Users table
CREATE SEQUENCE IF NOT EXISTS wallet_index_seq START 1;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  wallet_address TEXT,
  wallet_index INTEGER UNIQUE DEFAULT nextval('wallet_index_seq'),
  upi_id TEXT,
  bank_details JSONB,
  trade_count INTEGER DEFAULT 0,
  completed_trades INTEGER DEFAULT 0,
  trust_score DECIMAL(5,2) DEFAULT 100.0,
  tier TEXT DEFAULT 'standard' CHECK (tier IN ('standard', 'silver', 'gold', 'vip')),
  is_verified BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Orders table (the order book)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  token TEXT NOT NULL DEFAULT 'USDC',
  chain TEXT DEFAULT 'base',
  amount DECIMAL(18,6) NOT NULL,
  min_amount DECIMAL(18,6),
  max_amount DECIMAL(18,6),
  rate DECIMAL(12,2) NOT NULL,
  fiat_currency TEXT DEFAULT 'INR',
  payment_methods TEXT[] DEFAULT '{"UPI"}',
  payment_details JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (
    status IN ('active', 'paused', 'filled', 'cancelled', 'expired')
  ),
  filled_amount DECIMAL(18,6) DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trades table (individual P2P trades)
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  token TEXT NOT NULL DEFAULT 'USDC',
  chain TEXT DEFAULT 'base',
  amount DECIMAL(18,6) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  fiat_amount DECIMAL(12,2) NOT NULL,
  fiat_currency TEXT DEFAULT 'INR',
  fee_amount DECIMAL(18,6) NOT NULL,
  fee_percentage DECIMAL(5,4) DEFAULT 0.005,
  buyer_receives DECIMAL(18,6) NOT NULL,
  payment_method TEXT DEFAULT 'UPI',
  escrow_tx_hash TEXT,
  release_tx_hash TEXT,
  fee_tx_hash TEXT,
  on_chain_trade_id INTEGER,
  status TEXT DEFAULT 'created' CHECK (
    status IN (
      'created', 'matched', 'in_escrow', 'fiat_sent',
      'fiat_confirmed', 'releasing', 'completed',
      'disputed', 'resolved', 'refunded', 'cancelled', 'expired'
    )
  ),
  escrow_locked_at TIMESTAMPTZ,
  fiat_sent_at TIMESTAMPTZ,
  fiat_confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  auto_release_at TIMESTAMPTZ,
  dispute_reason TEXT,
  dispute_evidence JSONB,
  resolution TEXT,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payment proofs
CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id),
  user_id UUID REFERENCES users(id),
  utr TEXT,
  amount DECIMAL(12,2),
  receiver_upi TEXT,
  screenshot_file_id TEXT,
  timestamp TIMESTAMPTZ,
  ai_verified BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fee collection tracking
CREATE TABLE IF NOT EXISTS fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id),
  amount DECIMAL(18,6) NOT NULL,
  token TEXT DEFAULT 'USDC',
  chain TEXT DEFAULT 'base',
  tx_hash TEXT,
  collected_at TIMESTAMPTZ DEFAULT now()
);

-- Trade messages (for dispute evidence)
CREATE TABLE IF NOT EXISTS trade_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id),
  user_id UUID REFERENCES users(id),
  message TEXT,
  message_type TEXT DEFAULT 'text',
  file_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bridge transactions
CREATE TABLE IF NOT EXISTS bridge_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  trade_id UUID REFERENCES trades(id),
  from_chain TEXT NOT NULL,
  to_chain TEXT NOT NULL,
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  from_amount DECIMAL(18,8) NOT NULL,
  to_amount DECIMAL(18,8),
  bridge_provider TEXT,
  lifi_route_id TEXT,
  source_tx_hash TEXT,
  destination_tx_hash TEXT,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  fee_amount DECIMAL(18,8),
  estimated_time INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Admin activity log
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_telegram_id BIGINT,
  action TEXT NOT NULL,
  trade_id UUID REFERENCES trades(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type_status ON orders(type, status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_buyer ON trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_trades_auto_release ON trades(status, auto_release_at);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_utr ON payment_proofs(utr);
CREATE INDEX IF NOT EXISTS idx_bridge_user ON bridge_transactions(user_id);

-- =============================================
-- RPC FUNCTIONS
-- =============================================

-- Get the active order book
CREATE OR REPLACE FUNCTION get_order_book(
  p_type TEXT DEFAULT NULL,
  p_token TEXT DEFAULT 'USDC',
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  order_id UUID,
  username TEXT,
  order_type TEXT,
  token TEXT,
  available_amount DECIMAL,
  rate DECIMAL,
  payment_methods TEXT[],
  trust_score DECIMAL,
  completed_trades INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    u.username,
    o.type,
    o.token,
    o.amount - o.filled_amount,
    o.rate,
    o.payment_methods,
    u.trust_score,
    u.completed_trades
  FROM orders o
  JOIN users u ON o.user_id = u.id
  WHERE o.status = 'active'
    AND (p_type IS NULL OR o.type = p_type)
    AND o.token = p_token
    AND o.amount > o.filled_amount
    AND u.is_banned = false
  ORDER BY
    CASE WHEN o.type = 'sell' THEN o.rate END ASC,
    CASE WHEN o.type = 'buy' THEN o.rate END DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get platform stats
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'total_users', (SELECT COUNT(*) FROM users),
    'total_trades', (SELECT COUNT(*) FROM trades),
    'completed_trades', (SELECT COUNT(*) FROM trades WHERE status = 'completed'),
    'active_orders', (SELECT COUNT(*) FROM orders WHERE status = 'active'),
    'total_volume', (SELECT COALESCE(SUM(amount), 0) FROM trades WHERE status = 'completed'),
    'total_fees', (SELECT COALESCE(SUM(amount), 0) FROM fees),
    'active_disputes', (SELECT COUNT(*) FROM trades WHERE status = 'disputed'),
    'active_bridges', (SELECT COUNT(*) FROM bridge_transactions WHERE status = 'processing')
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (bot backend uses service key)
CREATE POLICY "Service role full access" ON users FOR ALL USING (true);
CREATE POLICY "Service role full access" ON orders FOR ALL USING (true);
CREATE POLICY "Service role full access" ON trades FOR ALL USING (true);
CREATE POLICY "Service role full access" ON payment_proofs FOR ALL USING (true);
