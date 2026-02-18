-- Add total_volume and points to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS total_volume NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS points NUMERIC DEFAULT 0;

-- Index for faster leaderboard queries
CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC);
