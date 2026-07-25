-- =============================================
-- Supabase Migration: Enable RLS across ALL public tables
-- =============================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I;', r.tablename);
        EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true);', r.tablename);
    END LOOP;
END $$;
