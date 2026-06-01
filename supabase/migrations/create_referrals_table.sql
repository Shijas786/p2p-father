-- =============================================
-- Referrals Table Schema
-- Run this in your Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_telegram_id BIGINT NOT NULL,
  referred_telegram_id BIGINT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_telegram_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_telegram_id);

-- Enable RLS and add a policy for service role
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on referrals" ON referrals FOR ALL USING (true);
