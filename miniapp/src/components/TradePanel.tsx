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
    loadData: () => void;
}

export function TradePanel({
    isUp, yesPrice, noPrice, cashBalance, positions, selectedRound, history, loadData
}: TradePanelProps) {
    const { showToast } = useToast();
    const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
    const [betType, setBetType] = useState<'UP' | 'DOWN'>('UP');
    const [betAmount, setBetAmount] = useState('');
    const [placingBet, setPlacingBet] = useState(false);

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

    if (selectedRound >= 0) {
        return (
            <div className="pm-trade-card pm-result-card-layout">
                <div className="pm-result-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4169E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                    </svg>
                </div>
                <div className="pm-result-title">
                    Result: {history[selectedRound]?.outcome === 'UP' ? 'Up' : 'Down'}
                </div>
                <div className="pm-result-date">
                    {new Date(history[selectedRound]?.timestamp || 0).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="pm-result-claim-box">
                    <button className="pm-btn-claim-nothing">Nothing to Claim</button>
                </div>
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
                        <p className={`pm-trade-direction ${isUp ? 'pm-green' : 'pm-red'}`}>{isUp ? 'Up' : 'Down'}</p>
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
                    onClick={() => { haptic('selection'); setBetType('UP'); }}
                    id="btn-bet-up">
                    Up {(yesPrice.buyPrice * 100).toFixed(0)}¢
                </button>
                <button
                    className={`pm-outcome-pill ${betType === 'DOWN' ? 'pm-outcome-pill-down-active' : 'pm-outcome-pill-inactive'}`}
                    onClick={() => { haptic('selection'); setBetType('DOWN'); }}
                    id="btn-bet-down">
                    Down {(noPrice.buyPrice * 100).toFixed(0)}¢
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
                        <span className="pm-amount-title pm-shares-title">Shares</span>
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
                                else setBetAmount((available * parseInt(v) / 100).toFixed(0));
                            }} id={`quick-${v}`}>{v}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Payout preview */}
            {betAmount && parseFloat(betAmount) > 0 && (
                tradeType === 'buy' ? (
                    <div className="pm-payout-info">
                        <div className="pm-payout-row"><span>Potential return</span><span className="pm-green pm-mono">${potentialPayout}</span></div>
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

            {/* Execute button */}
            <button
                className={`pm-exec-btn ${tradeType === 'sell' ? 'pm-exec-sell' : (betType === 'UP' ? 'pm-exec-up' : 'pm-exec-down')}`}
                disabled={placingBet || !betAmount || parseFloat(betAmount) <= 0}
                onClick={handlePlacePrediction}
                id="btn-place-bet">
                {placingBet
                    ? <span className="pm-btn-loading"><div className="pm-spinner pm-spinner-sm"/> Processing...</span>
                    : `${tradeType === 'buy' ? 'Log In To Trade' : 'Sell'} ${betType === 'UP' ? 'Up' : 'Down'}`}
            </button>
        </div>
    );
}
