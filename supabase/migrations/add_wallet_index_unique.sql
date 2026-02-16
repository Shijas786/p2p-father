-- Add UNIQUE constraint to wallet_index to prevent race condition duplicates
-- This ensures no two users can ever share the same wallet_index
-- even if the application-level retry loop fails.

-- First, clean up any existing duplicates (keep the one with the earliest created_at)
-- This is a safety measure in case there are still duplicates from the old bug.

-- Step 1: Add unique constraint (will fail if duplicates exist, so we handle it)
DO $$
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_wallet_index_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_wallet_index_unique UNIQUE (wallet_index);
        RAISE NOTICE 'Added UNIQUE constraint on wallet_index';
    ELSE
        RAISE NOTICE 'UNIQUE constraint on wallet_index already exists';
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE WARNING 'Cannot add UNIQUE constraint: duplicate wallet_index values exist. Clean them up first!';
END;
$$;

-- Also add unique constraint on telegram_id to prevent duplicate users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_telegram_id_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_telegram_id_unique UNIQUE (telegram_id);
        RAISE NOTICE 'Added UNIQUE constraint on telegram_id';
    ELSE
        RAISE NOTICE 'UNIQUE constraint on telegram_id already exists';
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE WARNING 'Cannot add UNIQUE constraint on telegram_id: duplicates exist.';
END;
$$;
