-- Migration: 20261003_get_platform_volume_rpc.sql
-- Description: Aggregates completed trade volume inside PostgreSQL to bypass 1,000-row PostgREST limits and optimize stats fetching.

CREATE OR REPLACE FUNCTION get_platform_volume()
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(amount), 0)
    FROM trades
    WHERE status IN ('completed', 'COMPLETED')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
