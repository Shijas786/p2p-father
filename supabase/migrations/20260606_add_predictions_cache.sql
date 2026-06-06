-- Add predictions_cache JSONB column to the users table for lag-free caching
ALTER TABLE users ADD COLUMN IF NOT EXISTS predictions_cache JSONB;
