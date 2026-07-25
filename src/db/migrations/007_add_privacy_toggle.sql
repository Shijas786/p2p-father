-- =============================================
-- Migration 007: Add hide_group_handle privacy toggle column to users table
-- =============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_group_handle BOOLEAN DEFAULT false;
