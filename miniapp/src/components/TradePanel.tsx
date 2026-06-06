import React, { useState } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { useToast } from './Toast';

interface TradePanelProps {
    isUp: boolean;
    yesPrice: { buyPrice: number; sellPrice: number };
    noPrice: { buyPrice: number; sellPrice: number };
    cashBalance: string;
    positions: any[];
    selectedRound: number;
    history: any[];
    trades: any[];
    loadData: () => void;
    onOutcomeChange?: (outcome: 'UP' | 'DOWN') => void;
    tradeType: 'buy' | 'sell';
    setTradeType: (t: 'buy' | 'sell') => void;
    betType: 'UP' | 'DOWN';
    setBetType: (t: 'UP' | 'DOWN') => void;
    betAmount: string;
    setBetAmount: React.Dispatch<React.SetStateAction<string>>;
    claiming?: boolean;
    setClaiming?: (c: boolean) => void;
    isLiveEnded?: boolean;
    activeMarket?: any;
}

export function TradePanel({
    isUp, yesPrice, noPrice, cashBalance, positions, selectedRound, history, trades, loadData, onOutcomeChange,
    tradeType, setTradeType, betType, setBetType, betAmount, setBetAmount,
    claiming: claimingProp, setClaiming: setClaimingProp,
    isLiveEnded, activeMarket
}: TradePanelProps) {
    const { showToast } = useToast();
    const [placingBet, setPlacingBet] = useState(false);
    const [localClaiming, setLocalClaiming] = useState(false);
    
    const claiming = claimingProp !== undefined ? claimingProp : localClaiming;
    const setClaiming = setClaimingProp !== undefined ? setClaimingProp : setLocalClaiming;

    const computedYesBuy = yesPrice.buyPrice;
    const computedNoBuy = noPrice.buyPrice;

    const potentialPayout = betAmount && parseFloat(betAmount) > 0
        ? (parseFloat(betAmount) / (betType === 'UP' ? computedYesBuy : computedNoBuy)).toFixed(2)
        : '0.00';

    const handleQuickAmount = (v: string) => {
        haptic('light');
        if (v === 'Max') { setBetAmount(parseFloat(cashBalance).toFixed(2)); return; }
        setBetAmount(prev => (parseFloat(prev || '0') + parseFloat(v)).toFixed(2));
    };

    const handlePlacePrediction = async () => {
        haptic('medium');
        if (!betAmount || parseFloat(betAmount) <= 0) { showToast('Enter a valid amount', 'warning'); return; }
        if (parseFloat(betAmount) > parseFloat(cashBalance)) { showToast('Insufficient cash balance', 'warning'); return; }
        setPlacingBet(true);
        try {
            const res = await api.predictions.placeBet(
                parseFloat(betAmount), betType,
                betType === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice,
                tradeType.toUpperCase() as 'BUY'|'SELL'
            );
            if (res.success) { showToast('Prediction placed!', 'success'); setBetAmount(''); loadData(); }
            else showToast('Failed to place prediction', 'error');
        } catch (e: any) { showToast(e.message || 'Order failed', 'error'); }
        finally { setPlacingBet(false); }
    };

    const isRoundEnded = selectedRound >= 0 || isLiveEnded;
    if (isRoundEnded) {
        let round = selectedRound >= 0 ? history[selectedRound] : null;
        if (!round && isLiveEnded && activeMarket) {
            const targetMs = new Date(activeMarket.endsAt).getTime() - 300000;
            round = history.find(h => h.timestamp === targetMs);
            if (!round) {
                round = {
                    time: new Date(targetMs).toLocaleTimeString(),
                    open: parseFloat(activeMarket.strikePrice || activeMarket.openPrice || 0),
                    close: null,
                    outcome: null,
                    timestamp: targetMs,
                    conditionId: activeMarket.conditionId
                };
            }
        }
        if (!round) return null;

        const roundStart = new Date(round.timestamp);
        const roundEnd = new Date(round.timestamp + 300000);
        const dateStr = roundStart.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
        const timeStartStr = roundStart.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
        const timeEndStr = roundEnd.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
        const marketTitle = `Bitcoin Up or Down - ${dateStr}, ${timeStartStr}-${timeEndStr} ET`;

        // Wait 1 min after close to show realistic "determining" phase
        const isDetermining = Date.now() - roundEnd.getTime() < 60000;

        // Compute user earnings
        const roundTrades = trades.filter(t => t.timestamp >= round.timestamp && t.timestamp < round.timestamp + 300000);
        let winQty = 0;
        let winCost = 0;
        let positionUp = 0;
        let positionDown = 0;
        
        for (const t of roundTrades) {
            const isBuy = t.side === 'BUY' || t.side === 'buy';
            if (t.outcome === round.outcome) {
                if (isBuy) { winQty += t.qty; winCost += t.cost; }
                else { winQty -= t.qty; winCost -= t.cost; }
            }
            if (t.outcome === 'UP') {
                if (isBuy) positionUp += t.qty;
                else positionUp -= t.qty;
            } else {
                if (isBuy) positionDown += t.qty;
                else positionDown -= t.qty;
            }
        }
        
        const claimKey = `pm-claimed-${round.timestamp}`;
        const hasClaimed = localStorage.getItem(claimKey) === 'true';

        const handleClaim = async () => {
            haptic('medium');
            setClaiming(true);
            try {
                const targetConditionId = roundTrades[0]?.conditionId || round.conditionId;
                if (!targetConditionId) throw new Error("No condition ID found for this round. Please wait for the system to auto-claim.");
                
                const res = await api.predictions.autoClaim(targetConditionId);
                if (res.claimed > 0) {
                    localStorage.setItem(claimKey, 'true');
                    showToast('Winnings successfully claimed!', 'success');
                    // Optional: delay reload to let UI update
                    setTimeout(() => loadData(), 1000);
                } else {
                    showToast('Market resolving... please try again in a few moments', 'error');
                }
            } catch (e: any) {
                showToast(e.message || 'Claim failed or already redeemed', 'error');
            } finally {
                setClaiming(false);
            }
        };

        if (isDetermining) {
            return (
                <div className="pm-trade-card pm-historical-panel-ui">
                    <div className="pm-determining-spinner">
                        <svg className="pm-spinner" viewBox="0 0 50 50">
                            <circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="4"></circle>
                        </svg>
                    </div>
                    <h3 className="pm-historical-h3">Hold on, determining winner...</h3>
                    <p className="pm-historical-market">{marketTitle}</p>
                    <p className="pm-historical-desc">This market has ended. Final resolution will appear automatically as soon as it is available on-chain.</p>
                    
                    {(positionUp > 0.01 || positionDown > 0.01) && (
                        <div className="pm-earnings-card" style={{ marginTop: 24 }}>
                            <h4 className="pm-earnings-title">Your Position</h4>
                            {positionUp > 0.01 && (
                                <div className="pm-earnings-row">
                                    <span className="pm-earnings-label">Up</span>
                                    <span className="pm-earnings-val">{positionUp.toFixed(2)} Shares</span>
                                </div>
                            )}
                            {positionDown > 0.01 && (
                                <div className="pm-earnings-row">
                                    <span className="pm-earnings-label">Down</span>
                                    <span className="pm-earnings-val">{positionDown.toFixed(2)} Shares</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="pm-trade-card pm-historical-panel-ui">
                <div className="pm-result-icon-wrapper">
                    <div className="pm-result-checkmark">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                </div>
                <h3 className="pm-historical-h3 pm-outcome-title">Outcome: {round.outcome === 'UP' ? 'Up' : 'Down'}</h3>
                <p className="pm-historical-market">{marketTitle}</p>
                
                {winQty >= 0.01 && !hasClaimed && (
                    <div className="pm-earnings-card">
                        <h4 className="pm-earnings-title">Your Earnings</h4>
                        <div className="pm-earnings-row">
                            <span className="pm-earnings-label">Position</span>
                            <span className="pm-earnings-val">{winQty.toFixed(2)} {round.outcome === 'UP' ? 'Up' : 'Down'}</span>
                        </div>
                        <div className="pm-earnings-row">
                            <span className="pm-earnings-label">Value per share</span>
                            <span className="pm-earnings-val">$1.00</span>
                        </div>
                        <div className="pm-earnings-row pm-earnings-total-row">
                            <span className="pm-earnings-label">Total</span>
                            <span className="pm-earnings-val">${winQty.toFixed(2)}</span>
                        </div>
                        <button className="pm-btn pm-btn-buy" style={{marginTop: 16}} onClick={handleClaim} disabled={claiming}>
                            {claiming ? 'Claiming...' : 'Claim Winnings'}
                        </button>
                    </div>
                )}
                
                {hasClaimed && winQty >= 0.01 && (
                     <div className="pm-earnings-card">
                        <h4 className="pm-earnings-title">Winnings Claimed</h4>
                        <div className="pm-earnings-row">
                            <span className="pm-earnings-label">Amount</span>
                            <span className="pm-earnings-val pm-green">+${winQty.toFixed(2)}</span>
                        </div>
                     </div>
                )}
                
                {winQty < 0.01 && (positionUp > 0.01 || positionDown > 0.01) && (
                    <div className="pm-earnings-card">
                        <h4 className="pm-earnings-title">Your Position</h4>
                        <div className="pm-earnings-row">
                            <span className="pm-earnings-label">Result</span>
                            <span className="pm-earnings-val" style={{ color: '#ff4d4d' }}>Not a winner</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="pm-trade-card">
            {/* Card header */}
            <div className="pm-trade-header">
                <div className="pm-trade-header-left">
                    <div className="pm-btc-icon-sq">₿</div>
                    <div>
                        <p className="pm-trade-market-name">BTC Up or Down 5m</p>
                        <p className={`pm-trade-direction ${betType === 'UP' ? 'pm-green' : 'pm-red'}`}>{betType === 'UP' ? 'Up' : 'Down'}</p>
                    </div>
                </div>
            </div>

            <div className="pm-trade-divider"/>

            {/* Buy/Sell tabs + Market dropdown */}
            <div className="pm-trade-tabs-row">
                <div className="pm-trade-tabs">
                    <button className={`pm-trade-tab ${tradeType === 'buy' ? 'pm-tab-active' : ''}`}
                        onClick={() => { haptic('selection'); setTradeType('buy'); }} id="tab-buy">
                        Buy
                    </button>
                    <button className={`pm-trade-tab ${tradeType === 'sell' ? 'pm-tab-active pm-tab-sell' : ''}`}
                        onClick={() => { haptic('selection'); setTradeType('sell'); }} id="tab-sell">
                        Sell
                    </button>
                </div>
                <button className="pm-market-dropdown" onClick={() => haptic('light')}>
                    Market <svg width="8" height="5" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 1l4 4 4-4"/></svg>
                </button>
            </div>

            {/* Outcome buttons */}
            <div className="pm-outcome-selector">
                <button
                    className={`pm-outcome-pill ${betType === 'UP' ? 'pm-outcome-pill-up-active' : 'pm-outcome-pill-inactive'}`}
                    onClick={() => { haptic('selection'); setBetType('UP'); onOutcomeChange?.('UP'); }}
                    id="btn-bet-up">
                    Up {(yesPrice.buyPrice * 100).toFixed(0)}<span className="pm-cent-sign">¢</span>
                </button>
                <button
                    className={`pm-outcome-pill ${betType === 'DOWN' ? 'pm-outcome-pill-down-active' : 'pm-outcome-pill-inactive'}`}
                    onClick={() => { haptic('selection'); setBetType('DOWN'); onOutcomeChange?.('DOWN'); }}
                    id="btn-bet-down">
                    Down {(noPrice.buyPrice * 100).toFixed(0)}<span className="pm-cent-sign">¢</span>
                </button>
            </div>

            {/* Amount / Shares */}
            {tradeType === 'buy' ? (
                <>
                    <div className="pm-amount-block">
                        <div className="pm-amount-row">
                            <div className="pm-amount-left">
                                <span className="pm-amount-title">AMOUNT</span>
                                <span className="pm-amount-sub">${parseFloat(cashBalance).toFixed(2)} cash</span>
                            </div>
                            <div className="pm-amount-right">
                                <span className="pm-dollar-sign pm-muted">$</span>
                                <input
                                    type="number"
                                    value={betAmount}
                                    onChange={e => setBetAmount(e.target.value)}
                                    placeholder="0"
                                    className="pm-amount-input pm-mono"
                                    id="input-bet-amount"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pm-quick-btns">
                        {[1, 5, 10, 100].map(v => (
                            <button key={v} className="pm-quick-btn" onClick={() => handleQuickAmount(String(v))} id={`quick-${v}`}>+${v}</button>
                        ))}
                        <button className="pm-quick-btn pm-quick-max" onClick={() => handleQuickAmount('Max')} id="quick-max">Max</button>
                    </div>
                </>
            ) : (
                <div className="pm-amount-block pm-sell-block">
                    <div className="pm-amount-row pm-sell-row">
                        <div className="pm-amount-left">
                            <span className="pm-amount-title pm-shares-title" style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 700, color: 'var(--pm-muted)' }}>SHARES</span>
                            <span className="pm-amount-sub">{positions.find(p => p.outcome === betType)?.qty?.toFixed(2) || '0.00'} Available</span>
                        </div>
                        <input
                            type="number"
                            value={betAmount}
                            onChange={e => setBetAmount(e.target.value)}
                            placeholder="0"
                            className="pm-amount-input pm-mono"
                            id="input-bet-shares"
                        />
                    </div>
                    <div className="pm-quick-btns pm-sell-quick-btns">
                        {['25%', '50%', '75%', 'Max'].map(v => (
                            <button key={v} className="pm-quick-btn pm-quick-pct" onClick={() => {
                                haptic('light');
                                const available = positions.find(p => p.outcome === betType)?.qty || 0;
                                if (v === 'Max') setBetAmount(available.toString());
                                else setBetAmount((available * parseInt(v) / 100).toFixed(2));
                            }} id={`quick-${v}`}>{v}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Payout preview */}
            {betAmount && parseFloat(betAmount) > 0 && (
                tradeType === 'buy' ? (
                    <div className="pm-payout-sell">
                        <div className="pm-payout-sell-left">
                            <span className="pm-receive-text">To win 💸</span>
                            <span className="pm-receive-avg">Avg. Price {(betType === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice) * 100}¢ ⓘ</span>
                        </div>
                        <div className="pm-payout-sell-right">
                            <span className="pm-green pm-receive-val pm-mono">${potentialPayout}</span>
                        </div>
                    </div>
                ) : (
                    <div className="pm-payout-sell">
                        <div className="pm-payout-sell-left">
                            <span className="pm-receive-text">You'll receive 💸</span>
                            <span className="pm-receive-avg">Avg. Price {(betType === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice) * 100}¢ ⓘ</span>
                        </div>
                        <div className="pm-payout-sell-right">
                            <span className="pm-green pm-receive-val pm-mono">
                                ${(parseFloat(betAmount) * (betType === 'UP' ? yesPrice.buyPrice : noPrice.buyPrice)).toFixed(2)}
                            </span>
                        </div>
                    </div>
                )
            )}

            <button
                className={`pm-exec-btn ${tradeType === 'sell' ? 'pm-exec-sell' : (betType === 'UP' ? 'pm-exec-up' : 'pm-exec-down')}`}
                disabled={placingBet || !betAmount || parseFloat(betAmount) <= 0}
                onClick={handlePlacePrediction}
                id="btn-place-bet">
                {placingBet
                    ? <span className="pm-btn-loading"><div className="pm-spinner pm-spinner-sm"/> Processing...</span>
                    : `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${betType === 'UP' ? 'Up' : 'Down'}`}
            </button>
        </div>
    );
}
