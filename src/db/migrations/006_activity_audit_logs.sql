-- =============================================
-- 006_activity_audit_logs.sql
-- P2PFather Bot — User & Trade Activity Audit
-- Run in Supabase SQL Editor
-- =============================================

-- ─────────────────────────────────────────────
-- TABLE 1: user_activity_log
--   Tracks every field-level change on the users
--   table. Populated automatically by the trigger
--   below, or manually from the bot on key events.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_activity_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_id   BIGINT,                      -- denormalized for fast lookup
    username      TEXT,                        -- snapshot at time of change
    event_type    TEXT        NOT NULL,         -- 'profile_update' | 'ban' | 'verify' | 'wallet_connect' | 'login' | 'custom'
    field_name    TEXT,                         -- which field changed (NULL if event has no single field)
    old_value     TEXT,                         -- previous value (cast to text)
    new_value     TEXT,                         -- new value (cast to text)
    changed_by    TEXT        DEFAULT 'system', -- 'user' | 'admin' | 'system'
    ip_address    TEXT,                         -- optional, if available
    meta          JSONB       DEFAULT '{}',     -- any extra context (trade_id, etc.)
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ual_user_id    ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ual_telegram   ON user_activity_log(telegram_id);
CREATE INDEX IF NOT EXISTS idx_ual_created_at ON user_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_event_type ON user_activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_ual_field_name ON user_activity_log(field_name);


-- ─────────────────────────────────────────────
-- TABLE 2: trade_activity_log
--   Tracks every status transition on the trades
--   table. Populated automatically by trigger.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_activity_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id    UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    buyer_id    UUID,
    seller_id   UUID,
    event_type  TEXT        NOT NULL,   -- 'status_change' | 'dispute_raised' | 'escrow_locked' | 'released' | 'cancelled'
    old_status  TEXT,
    new_status  TEXT,
    field_name  TEXT,                   -- e.g. 'dispute_reason', 'release_tx_hash'
    old_value   TEXT,
    new_value   TEXT,
    triggered_by TEXT       DEFAULT 'system', -- 'buyer' | 'seller' | 'admin' | 'system' | 'auto_release'
    meta        JSONB       DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tal_trade_id    ON trade_activity_log(trade_id);
CREATE INDEX IF NOT EXISTS idx_tal_buyer_id    ON trade_activity_log(buyer_id);
CREATE INDEX IF NOT EXISTS idx_tal_seller_id   ON trade_activity_log(seller_id);
CREATE INDEX IF NOT EXISTS idx_tal_created_at  ON trade_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tal_event_type  ON trade_activity_log(event_type);


-- ─────────────────────────────────────────────
-- TRIGGER: auto-log user profile field changes
--   Fires on every UPDATE to the users table and
--   writes one row per changed monitored field.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_log_user_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    monitored_fields TEXT[] := ARRAY[
        'receive_address',
        'upi_id',
        'phone_number',
        'bank_account_number',
        'bank_ifsc',
        'bank_name',
        'wallet_address',
        'wallet_type',
        'is_banned',
        'is_verified',
        'tier',
        'cdm_bank_number',
        'cdm_bank_name',
        'cdm_phone',
        'cdm_user_name',
        'digital_rupee_id',
        'username',
        'first_name'
    ];
    f TEXT;
    old_val TEXT;
    new_val TEXT;
BEGIN
    FOREACH f IN ARRAY monitored_fields LOOP
        EXECUTE format('SELECT ($1).%I::TEXT', f) INTO old_val USING OLD;
        EXECUTE format('SELECT ($1).%I::TEXT', f) INTO new_val USING NEW;

        IF old_val IS DISTINCT FROM new_val THEN
            INSERT INTO user_activity_log (
                user_id, telegram_id, username,
                event_type, field_name, old_value, new_value,
                changed_by, created_at
            ) VALUES (
                NEW.id,
                NEW.telegram_id,
                NEW.username,
                CASE
                    WHEN f = 'is_banned'   THEN 'ban_change'
                    WHEN f = 'is_verified' THEN 'verification_change'
                    WHEN f = 'tier'        THEN 'tier_change'
                    WHEN f IN ('wallet_address','wallet_type') THEN 'wallet_change'
                    ELSE 'profile_update'
                END,
                f,
                old_val,
                new_val,
                'system',
                now()
            );
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_user_changes ON users;
CREATE TRIGGER trg_log_user_changes
    AFTER UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_log_user_changes();


-- ─────────────────────────────────────────────
-- TRIGGER: auto-log trade status changes
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_log_trade_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    monitored_fields TEXT[] := ARRAY[
        'status',
        'dispute_reason',
        'escrow_tx_hash',
        'release_tx_hash',
        'fee_tx_hash',
        'resolution',
        'buyer_custom_address'
    ];
    f TEXT;
    old_val TEXT;
    new_val TEXT;
BEGIN
    FOREACH f IN ARRAY monitored_fields LOOP
        EXECUTE format('SELECT ($1).%I::TEXT', f) INTO old_val USING OLD;
        EXECUTE format('SELECT ($1).%I::TEXT', f) INTO new_val USING NEW;

        IF old_val IS DISTINCT FROM new_val THEN
            INSERT INTO trade_activity_log (
                trade_id, buyer_id, seller_id,
                event_type,
                old_status, new_status,
                field_name, old_value, new_value,
                triggered_by, created_at
            ) VALUES (
                NEW.id,
                NEW.buyer_id,
                NEW.seller_id,
                CASE
                    WHEN f = 'status' AND new_val = 'disputed'   THEN 'dispute_raised'
                    WHEN f = 'status' AND new_val = 'completed'  THEN 'trade_completed'
                    WHEN f = 'status' AND new_val = 'cancelled'  THEN 'trade_cancelled'
                    WHEN f = 'status' AND new_val = 'refunded'   THEN 'trade_refunded'
                    WHEN f = 'status' AND new_val = 'in_escrow'  THEN 'escrow_locked'
                    WHEN f = 'status'                            THEN 'status_change'
                    WHEN f = 'release_tx_hash'                   THEN 'crypto_released'
                    WHEN f = 'dispute_reason'                    THEN 'dispute_detail'
                    ELSE 'field_change'
                END,
                CASE WHEN f = 'status' THEN old_val ELSE OLD.status END,
                CASE WHEN f = 'status' THEN new_val ELSE NEW.status END,
                f,
                old_val,
                new_val,
                'system',
                now()
            );
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_trade_changes ON trades;
CREATE TRIGGER trg_log_trade_changes
    AFTER UPDATE ON trades
    FOR EACH ROW
    EXECUTE FUNCTION fn_log_trade_changes();


-- ─────────────────────────────────────────────
-- HELPER VIEW: recent activity (last 24h)
--   Query: SELECT * FROM v_recent_user_activity
--          WHERE username ILIKE '%aslamdt%';
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_recent_user_activity AS
SELECT
    ual.created_at,
    ual.username,
    ual.telegram_id,
    ual.event_type,
    ual.field_name,
    ual.old_value,
    ual.new_value,
    ual.changed_by,
    ual.meta
FROM user_activity_log ual
WHERE ual.created_at >= now() - INTERVAL '24 hours'
ORDER BY ual.created_at DESC;


-- ─────────────────────────────────────────────
-- HELPER VIEW: user trade timeline
--   Query: SELECT * FROM v_trade_timeline
--          WHERE buyer_id = '<uuid>' OR seller_id = '<uuid>';
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_trade_timeline AS
SELECT
    tal.created_at,
    tal.trade_id,
    tal.event_type,
    tal.old_status,
    tal.new_status,
    tal.field_name,
    tal.old_value,
    tal.new_value,
    tal.triggered_by,
    b.username  AS buyer_username,
    s.username  AS seller_username,
    tal.buyer_id,
    tal.seller_id
FROM trade_activity_log tal
LEFT JOIN users b ON b.id = tal.buyer_id
LEFT JOIN users s ON s.id = tal.seller_id
ORDER BY tal.created_at DESC;


-- ─────────────────────────────────────────────
-- RLS: Only service_role can read audit logs
-- ─────────────────────────────────────────────
ALTER TABLE user_activity_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_activity_log ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default in Supabase, so these
-- deny-all policies protect against anon/authenticated reads:
DROP POLICY IF EXISTS "deny_all_user_activity_log"  ON user_activity_log;
DROP POLICY IF EXISTS "deny_all_trade_activity_log" ON trade_activity_log;

CREATE POLICY "deny_all_user_activity_log"
    ON user_activity_log FOR ALL
    USING (false);

CREATE POLICY "deny_all_trade_activity_log"
    ON trade_activity_log FOR ALL
    USING (false);

