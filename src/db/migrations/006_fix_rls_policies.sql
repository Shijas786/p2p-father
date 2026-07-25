-- =============================================
-- Migration 006: Enable RLS & Lock Down ALL Public Tables in Supabase
-- Run this in your Supabase SQL Editor
-- =============================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        -- 1. Enable RLS on every table
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        
        -- 2. Drop existing policy if present to avoid conflicts
        EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I;', r.tablename);
        
        -- 3. Create full access policy strictly for service_role
        EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true);', r.tablename);
    END LOOP;
END $$;
