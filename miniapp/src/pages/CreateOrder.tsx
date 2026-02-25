import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseUnits, formatUnits } from 'viem';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { CONTRACTS, ESCROW_ABI, ERC20_ABI } from '../lib/contracts';
import { wagmiConfig, appKit } from '../lib/wagmi';
import { useAuth } from '../hooks/useAuth';
import './CreateOrder.css';

const PAYMENT_METHODS = ['UPI', 'IMPS', 'NEFT', 'PAYTM', 'BANK'];

export function CreateOrder() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { address, isConnected, chain: walletChain } = useAccount();
    const [step, setStep] = useState(1);
    const [type, setType] = useState<'sell' | 'buy'>('sell');
    const [token, setToken] = useState('USDC');
    const [chain, setChain] = useState('base'); // base | bsc
    const [amount, setAmount] = useState('');
    const [rate, setRate] = useState('');
    const [methods, setMethods] = useState<string[]>(['UPI']);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [txStep, setTxStep] = useState<'idle' | 'approving' | 'depositing' | 'creating'>('idle');
    const [feePercentage, setFeePercentage] = useState<number>(0.01); // Default to 1%
    const [approvalDone, setApprovalDone] = useState(false);
    const [bnbPriceInr, setBnbPriceInr] = useState<number>(0);

    // Fetch BNB price in INR when token is BNB
    useEffect(() => {
        if (token === 'BNB') {
            fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=inr')
                .then(r => r.json())
                .then(data => {
                    const price = data?.binancecoin?.inr || 0;
                    setBnbPriceInr(price);
                })
                .catch(() => setBnbPriceInr(0));
        }
    }, [token]);

    // Auto-fill total INR for BNB when amount changes
    useEffect(() => {
        if (token === 'BNB' && bnbPriceInr > 0 && amount) {
            const total = parseFloat(amount) * bnbPriceInr;
            if (!isNaN(total) && total > 0) {
                setRate(Math.round(total).toString());
            }
        }
    }, [amount, bnbPriceInr, token]);

    const formatBal = (val: any, decs = 2) => {
        const num = parseFloat(val || '0');
        if (num > 0 && num < 0.0001) return '0.0000';
        if (num === 0) return '0.00';
        return num.toFixed(decs);
    };

    // Decimal logic synchronized with backend EscrowService
    const getDecimals = () => {
        if (chain === 'base' && (token === 'USDC' || token === 'USDT')) return 6;
        return 18;
    };
    const decimals = getDecimals();

    // Wagmi: Contract Interactions
    const targetChainId = chain === 'bsc' ? 56 : 8453;
    const isCorrectChain = walletChain?.id === targetChainId;

    const tokenAddress = (CONTRACTS as any)[chain]?.tokens[token];
    const isExternalUser = user?.wallet_type === 'external';
    const escrowAddress = (CONTRACTS as any)[chain]?.escrow;
    const effectiveAddress = (isExternalUser ? address : user?.wallet_address) as `0x${string}` | undefined;

    // 1. Check Vault Balance
    const { data: vaultBalance, isLoading: loadingVault } = useReadContract({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: 'balances',
        args: effectiveAddress && tokenAddress ? [effectiveAddress, tokenAddress] : undefined,
        chainId: targetChainId,
        query: {
            enabled: !!effectiveAddress && !!tokenAddress && !!escrowAddress && type === 'sell'
        }
    });

    // 2. Check ERC20 Allowance
    const { data: allowance, isLoading: loadingAllowance } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: address && escrowAddress ? [address, escrowAddress] : undefined,
        chainId: targetChainId,
        query: {
            enabled: !!address && !!tokenAddress && !!escrowAddress && type === 'sell' && isExternalUser
        }
    });

    const { writeContractAsync } = useWriteContract();

    const TOKENS_BY_CHAIN: Record<string, string[]> = {
        base: ['USDC', 'USDT'],
        bsc: ['USDC', 'USDT', 'BNB']
    };

    const [reserved, setReserved] = useState(0);
    useEffect(() => {
        if (type === 'sell') {
            api.wallet.getBalances().then(data => {
                let res = '0';
                if (chain === 'base') {
                    res = (token === 'USDC' ? data.reserved_base_usdc : data.reserved_base_usdt) || '0';
                } else {
                    res = (token === 'USDC' ? data.reserved_bsc_usdc :
                        token === 'USDT' ? data.reserved_bsc_usdt :
                            token === 'BNB' ? data.reserved_bsc_bnb : '0') || '0';
                }
                setReserved(parseFloat(res));
            }).catch(console.error);
        }
        // Fetch fee from stats
        api.stats.get().then(data => {
            if (data.fee_percentage) setFeePercentage(data.fee_percentage);
        }).catch(console.error);
    }, [type, chain, token]);

    const physicalBalance = vaultBalance !== undefined ? parseFloat(formatUnits(vaultBalance as bigint, decimals)) : 0;
    const availableBalance = physicalBalance - reserved;

    const isNative = (chain === 'bsc' && token === 'BNB') || (chain === 'base' && token === 'ETH');
    // Use a small epsilon (1e-6) to avoid floating point precision issues
    const needsDeposit = type === 'sell' && vaultBalance !== undefined && amount &&
        availableBalance < (parseFloat(amount) - 0.000001);

    const needsApproval = !isNative && needsDeposit && isExternalUser && allowance !== undefined && amount &&
        parseFloat(formatUnits(allowance as bigint, decimals)) < parseFloat(amount);

    // Guard: Wait for balance info if sell, AND wait for connection if we know we are an external user
    const isDataLoading = (type === 'sell') && (loadingVault || (isExternalUser && (loadingAllowance || !isConnected)));

    function toggleMethod(m: string) {
        haptic('selection');
        setMethods(prev =>
            prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
        );
    }


    async function handleApprove() {
        if (!amount || !isExternalUser || !isConnected || !address) return;
        haptic('medium');
        setSubmitting(true);
        setError('');

        try {
            if (!isCorrectChain) {
                setError(`Please switch to ${chain === 'bsc' ? 'BSC' : 'Base'} network`);
                appKit.open({ view: 'Networks' });
                setSubmitting(false);
                return;
            }

            const amountUnits = parseUnits(amount, decimals);
            const currentEscrow = chain === 'bsc' ? "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a" : escrowAddress;
            const isBsc = chain === 'bsc';
            const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

            setTxStep('approving');
            const hash = await writeContractAsync({
                address: tokenAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [currentEscrow as `0x${string}`, amountUnits],
                gasPrice,
                gas: isBsc ? 100000n : undefined
            });
            console.log('Approval Sent:', hash);
            await waitForTransactionReceipt(wagmiConfig, { hash });

            haptic('success');
            setApprovalDone(true);
        } catch (err: any) {
            console.error(err);
            setError(err.shortMessage || err.message || 'Approval failed');
            haptic('error');
        } finally {
            setSubmitting(false);
            setTxStep('idle');
        }
    }

    async function submit() {
        if (isDataLoading) return;
        haptic('medium');
        setSubmitting(true);
        setError('');

        try {
            // ─── EXTERNAL WALLET FLOW ───
            if (isExternalUser && type === 'sell') {
                if (!isConnected || !address) {
                    setError("External wallet disconnected. Please reconnect.");
                    appKit.open();
                    setSubmitting(false);
                    return;
                }

                const amountUnits = parseUnits(amount, decimals);
                const currentEscrow = chain === 'bsc' ? "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a" : escrowAddress;

                if (!isCorrectChain) {
                    setError(`Please switch to ${chain === 'bsc' ? 'BSC' : 'Base'} network`);
                    appKit.open({ view: 'Networks' });
                    setSubmitting(false);
                    return;
                }

                const isBsc = chain === 'bsc';
                const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

                // Deposit if needed (approval should already be done)
                if (needsDeposit) {
                    setTxStep('depositing');
                    const hash = await writeContractAsync({
                        address: currentEscrow as `0x${string}`,
                        abi: ESCROW_ABI,
                        functionName: 'deposit',
                        args: [tokenAddress as `0x${string}`, amountUnits],
                        value: isNative ? amountUnits : undefined,
                        gasPrice,
                        gas: isBsc ? 500000n : undefined
                    });
                    console.log('Deposit Sent:', hash);
                    await waitForTransactionReceipt(wagmiConfig, { hash });
                }
            }

            // ─── BACKEND API CALL ───
            setTxStep('creating');
            // For BNB: user enters total INR, calculate rate per coin
            const effectiveRate = token === 'BNB'
                ? parseFloat(rate) / parseFloat(amount)
                : parseFloat(rate);
            await api.orders.create({
                type,
                token,
                chain,
                amount: parseFloat(amount),
                rate: effectiveRate,
                payment_methods: methods,
            });

            haptic('success');
            navigate('/');
        } catch (err: any) {
            console.error(err);
            setError(err.shortMessage || err.message || 'Failed to create order');
            haptic('error');
        } finally {
            setSubmitting(false);
            setTxStep('idle');
            setApprovalDone(false);
        }
    }



    return (
        <div className="page animate-in">
            <div className="page-header">
                <h1 className="page-title">Create Ad</h1>
                <p className="page-subtitle text-muted">List your buy/sell order on the marketplace</p>
            </div>

            <div className="co-form-container">
                {step === 1 && (
                    <div className="co-step-content animate-in">
                        {/* 1. Basic Info Section */}
                        <div className="co-section card-glass">
                            <div className="co-section-title">1. Trade Type</div>
                            <div className="flex gap-2 mb-4">
                                <button
                                    className={`btn-toggle-type flex-1 ${type === 'sell' ? 'active sell' : ''}`}
                                    onClick={() => { haptic('selection'); setType('sell'); }}
                                >
                                    🔴 SELL
                                </button>
                                <button
                                    className={`btn-toggle-type flex-1 ${type === 'buy' ? 'active buy' : ''}`}
                                    onClick={() => { haptic('selection'); setType('buy'); }}
                                >
                                    🟢 BUY
                                </button>
                            </div>

                            <div className="co-section-title">2. Network</div>
                            <div className="flex gap-2 mb-4">
                                <button
                                    className={`btn-toggle-net flex-1 ${chain === 'base' ? 'active' : ''}`}
                                    onClick={() => { setChain('base'); setToken('USDC'); }}
                                >
                                    Base
                                </button>
                                <button
                                    className={`btn-toggle-net flex-1 ${chain === 'bsc' ? 'active' : ''}`}
                                    onClick={() => { setChain('bsc'); setToken('USDT'); }}
                                >
                                    BSC
                                </button>
                            </div>

                            <div className="co-section-title">3. Token</div>
                            <div className="co-token-row">
                                {TOKENS_BY_CHAIN[chain].map(t => (
                                    <button
                                        key={t}
                                        className={`co-token-pill ${token === t ? 'active' : ''}`}
                                        onClick={() => { haptic('selection'); setToken(t); }}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4">
                            <button
                                className="btn btn-primary btn-block btn-lg"
                                onClick={() => setStep(2)}
                            >
                                Next Step ➡️
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="co-step-content animate-in">
                        {/* 2. Transaction Details */}
                        <div className="co-section card-glass">
                            <div className="co-section-title">4. Amount</div>
                            <div className="co-input-group mb-2">
                                <input
                                    type="number"
                                    placeholder="Amount"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="co-input-flat font-mono"
                                />
                                <span className="co-input-label">{token}</span>
                            </div>

                            <div className="co-presets-row mb-4">
                                {['10', '50', '100', '500'].map(p => (
                                    <button key={p} className="btn-preset-sm" onClick={() => setAmount(p)}>{p}</button>
                                ))}
                            </div>

                            <div className="co-section-title">{token === 'BNB' ? '5. Total INR' : '5. Rate'}</div>
                            <div className="co-input-group mb-4">
                                <span className="co-input-label">₹</span>
                                <input
                                    type="number"
                                    placeholder={token === 'BNB' ? 'Total INR you want' : 'Rate'}
                                    value={rate}
                                    onChange={e => setRate(e.target.value)}
                                    className="co-input-flat font-mono"
                                />
                                {token !== 'BNB' && <span className="co-input-label">/ {token}</span>}
                            </div>

                            <div className="co-section-title">6. Payment Methods</div>
                            <div className="co-payment-grid">
                                {PAYMENT_METHODS.map(m => (
                                    <button
                                        key={m}
                                        className={`co-method-chip ${methods.includes(m) ? 'active' : ''}`}
                                        onClick={() => toggleMethod(m)}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Summary & Vault */}
                        {amount && rate && (
                            <div className="co-summary-mini card-glass glow-green mb-3">
                                <div className="flex justify-between items-center text-xs mb-1">
                                    <span className="text-muted uppercase">Total Fiat</span>
                                    <span className="font-mono font-bold text-green text-lg">
                                        ₹{token === 'BNB'
                                            ? (parseFloat(rate) * (1 - (feePercentage / 2))).toLocaleString()
                                            : (parseFloat(amount) * (1 - (feePercentage / 2)) * parseFloat(rate)).toLocaleString()}
                                    </span>
                                </div>
                                <div className="border-t border-white/10 my-2"></div>
                                <div className="flex justify-between items-center text-[10px] text-muted">
                                    <span>Trading Fee ({(feePercentage * 100).toFixed(1)}%)</span>
                                    <span>{(feePercentage * 50).toFixed(1)}% Buyer + {(feePercentage * 50).toFixed(1)}% Seller</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] mt-1">
                                    <span className="text-orange">You (Seller) Lock:</span>
                                    <span className="font-mono">{(parseFloat(amount)).toFixed(4)} {token}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-muted">Ad Displays:</span>
                                    <span className="font-mono text-secondary">{(parseFloat(amount) * (1 - (feePercentage / 2))).toFixed(4)} {token}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-green">Buyer Receives:</span>
                                    <span className="font-mono">{(parseFloat(amount) * (1 - feePercentage)).toFixed(4)} {token}</span>
                                </div>
                            </div>
                        )}

                        {type === 'sell' && (
                            <div className={`co-vault-box card-glass mb-3 ${availableBalance < parseFloat(amount || '0') ? 'border-orange' : 'border-green'}`}>
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-muted uppercase">Vault Balance</span>
                                    <span className={availableBalance < parseFloat(amount || '0') ? 'text-orange' : 'text-green'}>
                                        {vaultBalance !== undefined ? formatBal(availableBalance, token === 'BNB' ? 4 : 2) : '...'} {token}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 mt-4">
                            <button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>
                            <button
                                className={`btn-publish flex-[2] ${needsDeposit && !isExternalUser ? 'disabled' : ''}`}
                                onClick={() => {
                                    const reqBalance = parseFloat(amount || '0');
                                    const needsDep = type === 'sell' && availableBalance < reqBalance;

                                    if (isExternalUser) {
                                        if (!isConnected) {
                                            appKit.open();
                                        } else if (needsApproval && !isNative && !approvalDone) {
                                            handleApprove();
                                        } else {
                                            submit();
                                        }
                                    } else {
                                        if (needsDep) navigate('/wallet'); else submit();
                                    }
                                }}
                                disabled={submitting || (type === 'sell' && (loadingVault || (isExternalUser && loadingAllowance)))}
                            >
                                {submitting ? (
                                    <div className="flex items-center gap-2 justify-center">
                                        <span className="spinner-white" />
                                        <span>{txStep.toUpperCase()}...</span>
                                    </div>
                                ) : (type === 'sell' && (loadingVault || (isExternalUser && loadingAllowance))) ? (
                                    <div className="flex items-center gap-2 justify-center">
                                        <span className="spinner-white" />
                                        <span>CHECKING...</span>
                                    </div>
                                ) : (isExternalUser && !isConnected) ? (
                                    'CONNECT WALLET'
                                ) : (isExternalUser && !isCorrectChain) ? (
                                    `SWITCH TO ${chain.toUpperCase()}`
                                ) : (isExternalUser && needsApproval && !isNative && !approvalDone) ? (
                                    `STEP 1: APPROVE ${token}`
                                ) : (
                                    (type === 'sell' && availableBalance < (parseFloat(amount || '0') - 0.000001))
                                        ? (isExternalUser ? `STEP 2: DEPOSIT & PUBLISH` : 'INSUFFICIENT BALANCE')
                                        : '🚀 PUBLISH'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="co-error-banner animate-shake mt-4">
                    <span>⚠️</span> {error}
                </div>
            )}
        </div>
    );
}
