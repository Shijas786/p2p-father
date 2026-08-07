-- ============================================================
-- P2PFather WhatsApp Bot Integration — Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add WhatsApp fields to the users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS whatsapp_phone     TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_id        TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS preferred_channel  TEXT DEFAULT 'telegram'
        CHECK (preferred_channel IN ('telegram', 'whatsapp', 'both'));

-- Index for fast WA phone lookups
CREATE UNIQUE INDEX IF NOT EXISTS users_whatsapp_phone_unique
    ON users (whatsapp_phone)
    WHERE whatsapp_phone IS NOT NULL;

-- 2. WhatsApp conversation state table
--    Stores transient multi-step flow state per user (ad creation, withdrawal, etc.)
CREATE TABLE IF NOT EXISTS whatsapp_states (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    key        TEXT        NOT NULL,           -- e.g. 'POST_AD', 'AWAITING_WITHDRAW_PIN'
    data       JSONB       NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-expire states older than 30 minutes (cleaned up by a cron or TTL check)
CREATE INDEX IF NOT EXISTS whatsapp_states_updated_at_idx
    ON whatsapp_states (updated_at);

-- 3. WhatsApp group broadcast registry
--    Stores all WhatsApp group JIDs where the bot should broadcast new ads
CREATE TABLE IF NOT EXISTS whatsapp_groups (
    group_jid   TEXT        PRIMARY KEY,       -- e.g. 120363049582716741@g.us
    group_name  TEXT        NOT NULL DEFAULT 'Unknown Group',
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Security: Row Level Security Policies
-- ============================================================

-- whatsapp_states: only service role can read/write
ALTER TABLE whatsapp_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to whatsapp_states"
    ON whatsapp_states FOR ALL
    USING (auth.role() = 'service_role');

-- whatsapp_groups: only service role can manage
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to whatsapp_groups"
    ON whatsapp_groups FOR ALL
    USING (auth.role() = 'service_role');
