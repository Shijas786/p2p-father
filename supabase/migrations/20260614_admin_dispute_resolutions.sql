-- Create admin_dispute_resolutions table for P2PFather
CREATE TABLE IF NOT EXISTS admin_dispute_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_telegram_id BIGINT NOT NULL,
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(18,6) NOT NULL,
  token TEXT NOT NULL,
  chain TEXT NOT NULL,
  released_to TEXT NOT NULL CHECK (released_to IN ('buyer', 'seller')),
  tx_hash TEXT,
  dispute_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_dispute_resolutions ENABLE ROW LEVEL SECURITY;

-- Service role full access policy
CREATE POLICY "Service role full access" ON admin_dispute_resolutions FOR ALL USING (true);
