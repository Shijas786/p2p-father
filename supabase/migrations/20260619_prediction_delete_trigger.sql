-- Migration: Add delete trigger on prediction_trades to maintain accurate user statistics
-- Run in Supabase SQL Editor

-- Trigger function: Update user stats on trade delete (decrement stats accordingly)
CREATE OR REPLACE FUNCTION trigger_on_prediction_trade_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE prediction_user_stats
  SET
    total_trades = GREATEST(0, total_trades - 1),
    total_wagered = GREATEST(0, total_wagered - OLD.cost_usdc),
    total_wins = GREATEST(0, total_wins - CASE WHEN OLD.resolution = 'WIN' THEN 1 ELSE 0 END),
    total_losses = GREATEST(0, total_losses - CASE WHEN OLD.resolution = 'LOSS' THEN 1 ELSE 0 END),
    realized_pnl = realized_pnl - COALESCE(OLD.pnl_usdc, 0),
    total_payout = GREATEST(0, total_payout - COALESCE(OLD.payout_usdc, 0)),
    pending_claims = GREATEST(0, pending_claims - CASE WHEN OLD.resolution = 'WIN' AND OLD.claimed = FALSE THEN 1 ELSE 0 END),
    updated_at = NOW()
  WHERE user_id = OLD.user_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE OR REPLACE TRIGGER trg_prediction_trades_delete
AFTER DELETE ON prediction_trades
FOR EACH ROW
EXECUTE FUNCTION trigger_on_prediction_trade_delete();
