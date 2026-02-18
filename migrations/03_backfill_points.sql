-- Backfill total_volume and points based on completed trades

-- 1. Reset counts (optional, but good for safety)
UPDATE users SET total_volume = 0, points = 0;

-- 2. Calculate Volume (1 point per 1 unit of volume)
WITH user_volumes AS (
    SELECT 
        buyer_id AS user_id, 
        SUM(amount) as vol 
    FROM trades 
    WHERE status = 'completed' 
    GROUP BY buyer_id
    UNION ALL
    SELECT 
        seller_id AS user_id, 
        SUM(amount) as vol 
    FROM trades 
    WHERE status = 'completed' 
    GROUP BY seller_id
)
UPDATE users u
SET total_volume = (
    SELECT COALESCE(SUM(vol), 0) 
    FROM user_volumes uv 
    WHERE uv.user_id = u.id
);

-- 3. Points = Volume (1:1)
UPDATE users SET points = total_volume;

-- 4. Unique Trade Bonus (20 pts per unique partner)
WITH trade_partners AS (
    -- Buyers' unique partners (sellers)
    SELECT DISTINCT buyer_id as user_id, seller_id as partner_id
    FROM trades 
    WHERE status = 'completed'
    UNION
    -- Sellers' unique partners (buyers)
    SELECT DISTINCT seller_id as user_id, buyer_id as partner_id
    FROM trades 
    WHERE status = 'completed'
),
unique_counts AS (
    SELECT user_id, COUNT(*) as unique_partners
    FROM trade_partners
    GROUP BY user_id
)
UPDATE users u
SET points = points + (COALESCE((SELECT unique_partners FROM unique_counts uc WHERE uc.user_id = u.id), 0) * 20);
