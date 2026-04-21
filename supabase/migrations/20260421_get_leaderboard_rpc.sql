-- Function to get leaderboard by timeframe (7d, 30d, all)
CREATE OR REPLACE FUNCTION get_timeframe_leaderboard(p_days int, p_limit int, p_offset int)
RETURNS TABLE (
  rank bigint,
  id uuid,
  name text,
  photo_url text,
  points numeric,
  volume numeric,
  trades bigint,
  telegram_id bigint,
  wallet_address text
) AS $$
BEGIN
  IF p_days = 0 THEN
    -- All Time: Sort by Points
    RETURN QUERY
    SELECT 
      ROW_NUMBER() OVER (ORDER BY u.points DESC) as rank,
      u.id, 
      COALESCE(u.username, u.first_name, 'Anon') as name,
      u.photo_url,
      u.points,
      u.total_volume as volume,
      u.trade_count::bigint as trades,
      u.telegram_id,
      u.wallet_address
    FROM users u
    ORDER BY u.points DESC
    LIMIT p_limit OFFSET p_offset;
  ELSE
    -- 7d/30d: Sort by Volume
    RETURN QUERY
    WITH stats AS (
      SELECT 
        user_id,
        SUM(amount) as period_volume,
        COUNT(*) as period_trades
      FROM (
        SELECT buyer_id as user_id, amount FROM trades WHERE status = 'completed' AND completed_at >= (now() - (p_days || ' days')::interval)
        UNION ALL
        SELECT seller_id as user_id, amount FROM trades WHERE status = 'completed' AND completed_at >= (now() - (p_days || ' days')::interval)
      ) combined
      GROUP BY user_id
    )
    SELECT 
      ROW_NUMBER() OVER (ORDER BY s.period_volume DESC) as rank,
      u.id,
      COALESCE(u.username, u.first_name, 'Anon') as name,
      u.photo_url,
      s.period_volume as points, -- For timeframe, points = volume for local sorting
      s.period_volume as volume,
      s.period_trades::bigint as trades,
      u.telegram_id,
      u.wallet_address
    FROM stats s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.period_volume DESC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$ LANGUAGE plpgsql;
