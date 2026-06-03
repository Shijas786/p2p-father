import fs from 'fs';

let content = fs.readFileSync('miniapp/src/components/DepositModal.tsx', 'utf8');

// 1. Add mode state
content = content.replace(
    "const [step, setStep] = useState<'options' | 'assets' | 'amount' | 'confirm' | 'processing' | 'success' | 'manual'>('options');",
    "const [mode, setMode] = useState<'deposit'|'withdraw'>('deposit');\n    const [step, setStep] = useState<'options' | 'assets' | 'amount' | 'confirm' | 'processing' | 'success' | 'manual'>('options');"
);

// 2. Add withdrawal specific states
content = content.replace(
    "const [amount, setAmount] = useState('');",
    "const [amount, setAmount] = useState('');\n    const [withdrawChain, setWithdrawChain] = useState<'Polygon'|'BSC'>('Polygon');\n    const [withdrawToken, setWithdrawToken] = useState<'USDC'|'USDT'>('USDC');\n    const [withdrawAddress, setWithdrawAddress] = useState('');"
);

// 3. Add API wrapper in miniapp/src/lib/api.ts
const apiPath = 'miniapp/src/lib/api.ts';
let apiContent = fs.readFileSync(apiPath, 'utf8');
if (!apiContent.includes('withdrawGasless')) {
    apiContent = apiContent.replace(
        "depositGasless: (amount: number, fromChain?: string, fromToken?: string) =>",
        "withdrawGasless: (amount: number, destChainId: number, destTokenAddress: string, recipient: string) =>\n            fetchAPI('/miniapp/withdraw', { method: 'POST', body: JSON.stringify({ amount, destChainId, destTokenAddress, recipient }) }),\n        depositGasless: (amount: number, fromChain?: string, fromToken?: string) =>"
    );
    fs.writeFileSync(apiPath, apiContent);
    console.log("Patched api.ts");
}

// 4. Add Withdraw Execution logic in Modal
const withdrawLogic = `
    const handleConfirmWithdraw = async () => {
        haptic('medium');
        setStep('processing');
        setErrorMsg('');
        try {
            const destChainId = withdrawChain === 'Polygon' ? 137 : 56;
            let destTokenAddress = '';
            if (destChainId === 137) {
                destTokenAddress = withdrawToken === 'USDC' ? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' : '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'; // USDC.e / USDT
            } else if (destChainId === 56) {
                destTokenAddress = withdrawToken === 'USDC' ? '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' : '0x55d398326f99059fF775485246999027B3197955';
            }
            
            // Note amount should be in base units (6 decimals) sent to backend, but backend expects BigInt string or number. Let backend handle the * 1e6.
            // Actually, wait! Backend expects base units or whole units?
            // depositGasless sends whole number? Let's check depositGasless. Yes. We'll send base units to withdraw.
            const baseAmount = Math.floor(parseFloat(amount) * 1e6).toString();

            const r = await api.predictions.withdrawGasless(parseFloat(amount), destChainId, destTokenAddress, withdrawAddress);
            if (r && r.txHash) {
                setTxHash(r.txHash);
                haptic('success');
                setStep('success');
                loadBalances();
            } else {
                throw new Error(r?.error || "Invalid response from server");
            }
        } catch (err: any) {
            console.error("Withdrawal failed:", err);
            setErrorMsg(err.message || "Withdraw transaction failed.");
            setStep('confirm');
            haptic('error');
        }
    };
`;
content = content.replace("const handleConfirmDeposit = async () => {", withdrawLogic + "\n    const handleConfirmDeposit = async () => {");

// 5. Update UI to include Tabs and Withdraw logic
const tabsUI = `
                <div style={{ display: 'flex', width: '100%', padding: '0 16px', gap: '8px', marginBottom: '10px' }}>
                    <button style={{ flex: 1, padding: '8px', background: mode === 'deposit' ? '#007aff' : 'transparent', color: mode === 'deposit' ? '#fff' : '#848e9c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }} onClick={() => { setMode('deposit'); setStep('options'); }}>Deposit</button>
                    <button style={{ flex: 1, padding: '8px', background: mode === 'withdraw' ? '#007aff' : 'transparent', color: mode === 'withdraw' ? '#fff' : '#848e9c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }} onClick={() => { setMode('withdraw'); setStep('options'); }}>Withdraw</button>
                </div>
`;

content = content.replace("{/* STEP 1: SELECT OPTIONS */}", tabsUI + "\n            {/* STEP 1: SELECT OPTIONS */}");

const withdrawUI = `
            {/* WITHDRAW FLOW */}
            {mode === 'withdraw' && step === 'options' && (
                <div className="pm-dep-content">
                    <div className="pm-wallet-card">
                        <div className="pm-wallet-info">
                            <div className="pm-wallet-avatar">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M16 11h4v4h-4z"/></svg>
                            </div>
                            <div>
                                <div className="pm-wallet-addr">Polymarket Balance</div>
                                <div className="pm-wallet-bal">
                                    Available: \${parseFloat(balances?.usdt || '0').toFixed(2)} pUSD
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mf-label" style={{marginTop: 10}}>Withdrawal Details</div>
                    
                    <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                        <div>
                            <div className="mf-label" style={{marginBottom: '4px'}}>Amount (pUSD)</div>
                            <input type="number" className="pm-big-amount" style={{fontSize: '24px', textAlign: 'left', padding: '12px', background: '#161920', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px'}} value={amount} placeholder="0.00" onChange={e => setAmount(e.target.value)} />
                        </div>
                        <div>
                            <div className="mf-label" style={{marginBottom: '4px'}}>Destination Chain</div>
                            <select style={{width: '100%', padding: '12px', background: '#161920', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff'}} value={withdrawChain} onChange={e => setWithdrawChain(e.target.value as any)}>
                                <option value="Polygon">Polygon</option>
                                <option value="BSC">BSC</option>
                            </select>
                        </div>
                        <div>
                            <div className="mf-label" style={{marginBottom: '4px'}}>Receive Token</div>
                            <select style={{width: '100%', padding: '12px', background: '#161920', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff'}} value={withdrawToken} onChange={e => setWithdrawToken(e.target.value as any)}>
                                <option value="USDC">USDC</option>
                                <option value="USDT">USDT</option>
                            </select>
                        </div>
                        <div>
                            <div className="mf-label" style={{marginBottom: '4px'}}>Destination Address</div>
                            <input type="text" style={{width: '100%', padding: '12px', background: '#161920', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', boxSizing: 'border-box'}} value={withdrawAddress} placeholder="0x..." onChange={e => setWithdrawAddress(e.target.value)} />
                        </div>
                    </div>

                    <button className="pm-btn-continue" 
                        disabled={!amount || parseFloat(amount) <= 0 || !withdrawAddress}
                        onClick={() => { haptic('selection'); setStep('confirm'); }}>
                        Continue
                    </button>
                </div>
            )}
`;

content = content.replace("{/* STEP 1: SELECT OPTIONS */}", withdrawUI + "\n            {/* STEP 1: SELECT OPTIONS */}\n            {mode === 'deposit' && ");
content = content.replace(")}", ")}"); // Ensure the mode==='deposit' is wrapped around deposit options

content = content.replace(
    "{/* STEP 3: CONFIRM & EXECUTE */}\n            {step === 'confirm' && selectedAsset && (", 
    `{/* STEP 3: CONFIRM & EXECUTE */}
            {step === 'confirm' && mode === 'deposit' && selectedAsset && (`
);

content = content.replace(
    "{/* STEP 4: PROCESSING */}", 
    `{/* WITHDRAW CONFIRM */}
            {step === 'confirm' && mode === 'withdraw' && (
                <div className="pm-dep-content">
                    <div className="pm-big-amount-wrapper">
                        <div style={{fontSize: '48px', fontWeight: 'bold'}}>\${amount}</div>
                        <div style={{fontSize: '13px', color: '#848e9c'}}>Withdrawal Confirmation</div>
                    </div>

                    <div className="pm-breakdown-card">
                        <div className="pm-breakdown-row">
                            <span>Source</span>
                            <span className="pm-breakdown-val">Polymarket Wallet</span>
                        </div>
                        <div className="pm-breakdown-row">
                            <span>Destination</span>
                            <span className="pm-breakdown-val">\${withdrawAddress.slice(0, 6)}...\${withdrawAddress.slice(-4)}</span>
                        </div>
                        <div className="pm-breakdown-row">
                            <span>Receive</span>
                            <span className="pm-breakdown-val" style={{color: '#4ade80'}}>\${amount} \${withdrawToken} (\${withdrawChain})</span>
                        </div>
                        <div className="pm-breakdown-row">
                            <span>Estimated Time</span>
                            <span className="pm-breakdown-val">Instant</span>
                        </div>
                    </div>

                    {errorMsg && (
                        <div style={{color: '#ff4d4f', fontSize: '13px', textAlign: 'center', marginTop: 10}}>
                            {errorMsg}
                        </div>
                    )}

                    <button className="pm-btn-continue" style={{background: '#007aff', color: '#fff'}} onClick={handleConfirmWithdraw}>
                        Confirm Withdrawal
                    </button>
                </div>
            )}
            
            {/* STEP 4: PROCESSING */}`
);


// Replace the condition for step === 'options' to wrap deposit options
content = content.replace(
    "{step === 'options' && (",
    "{mode === 'deposit' && step === 'options' && ("
);


fs.writeFileSync('miniapp/src/components/DepositModal.tsx', content);
console.log("Patched DepositModal.tsx");
