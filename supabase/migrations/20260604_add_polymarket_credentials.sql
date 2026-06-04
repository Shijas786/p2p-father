-- Add Polymarket API credentials and status columns to the users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS polymarket_api_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS polymarket_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS polymarket_passphrase TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS polymarket_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_wallet_address TEXT;
