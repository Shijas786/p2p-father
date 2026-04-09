-- Add digital_rupee_id to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS digital_rupee_id TEXT;
