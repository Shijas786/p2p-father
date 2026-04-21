-- Add missing expires_at column to orders table
-- This is required for the Ad Expiration feature to function.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add an index for the background job to run efficiently
CREATE INDEX IF NOT EXISTS idx_orders_expires_at_status ON orders(expires_at, status) WHERE status = 'active';
