-- Run this in Supabase SQL Editor to create the autoclaim_skips table
-- This table persists losing conditions so the AutoClaim job never hammers them again after a server restart

CREATE TABLE IF NOT EXISTS autoclaim_skips (
    skip_key TEXT PRIMARY KEY,          -- "{wallet_index}-{condition_id}"
    condition_id TEXT NOT NULL,
    wallet_index INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'losing_skip',  -- 'losing_skip' | 'zero_balance'
    reason TEXT,                        -- short description of why it was skipped
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by status
CREATE INDEX IF NOT EXISTS idx_autoclaim_skips_status ON autoclaim_skips(status);

-- Disable RLS (server-side only, no public access needed)
ALTER TABLE autoclaim_skips DISABLE ROW LEVEL SECURITY;
