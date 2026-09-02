import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useReadContract, useWriteContract, useSwitchChain, useChainId } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseUnits, formatUnits, maxUint256 } from 'viem';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { CONTRACTS, ESCROW_ABI, ERC20_ABI } from '../lib/contracts';
import { wagmiConfig, appKit, BASE_BUILDER_DATA_SUFFIX } from '../lib/wagmi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Toast';
import { useBalance } from 'wagmi';
import { bsc, base } from 'wagmi/chains';
import { formatError } from '../lib/utils';
import { IconChainBase, IconChainBsc } from '../components/Icons';
import './CreateOrder.css';

const PAYMENT_METHODS = ['UPI', 'IMPS', 'NEFT', 'PAYTM', 'BANK', 'CDM', 'DIGITAL_RUPEE'];

export function CreateOrder() {
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const currentChainId = useChainId();
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [type, setType] = useState<'sell' | 'buy'>('sell');
    const [token, setToken] = useState('USDT');
    const [chain, setChain] = useState('base'); // base | bsc
    const [amount, setAmount] = useState('');
    const [rate, setRate] = useState('');
    const [methods, setMethods] = useState<string[]>(['UPI']);
    const [note, setNote] = useState('');
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [excludedDealerUsernames, setExcludedDealerUsernames] = useState<string[]>([]);
    const [allowedDealerUsernames, setAllowedDealerUsernames] = useState<string[]>([]);
    const [expiryMinutes, setExpiryMinutes] = useState(60); // 1 hour default
    const [dealerSelectionMode, setDealerSelectionMode] = useState<'exclude' | 'allow' | null>(null);
    const [isAdvancedSettingsExpanded, setIsAdvancedSettingsExpanded] = useState(false);
    const [excludeSearchQuery, setExcludeSearchQuery] = useState('');
    const [newTradersOnly, setNewTradersOnly] = useState(false);
    const [requireKyc, setRequireKyc] = useState(false);

    useEffect(() => {
        api.users.list().then(data => {
            let list = (data?.users || []).filter((u: any) => u.username && u.id !== user?.id);
            if (list.length === 0) {
                list = [
                    { id: 'demo1', username: 'Kerala_P2P_King', completed_trades: 1240, photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80' },
                    { id: 'demo2', username: 'Traders_Union', completed_trades: 850, photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80' },
                    { id: 'demo3', username: 'Crypto_Sultan', completed_trades: 610, photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80' },
                    { id: 'demo4', username: 'Super_Dealer_IN', completed_trades: 450, photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80' }
                ];
            }
            setAllUsers(list);
        }).catch(() => {
            setAllUsers([
                { id: 'demo1', username: 'Kerala_P2P_King', completed_trades: 1240, photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80' },
                { id: 'demo2', username: 'Traders_Union', completed_trades: 850, photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80' },
                { id: 'demo3', username: 'Crypto_Sultan', completed_trades: 610, photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80' },
                { id: 'demo4', username: 'Super_Dealer_IN', completed_trades: 450, photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80' }
            ]);
        });
    }, [user]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [txStep, setTxStep] = useState<'idle' | 'approving' | 'depositing' | 'creating'>('idle');
    const [feePercentage, setFeePercentage] = useState<number>(0.005); // Default to 0.5%
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
    const isCorrectChain = currentChainId === targetChainId;

    const tokenAddress = (CONTRACTS as any)[chain]?.tokens[token];
    const isExternalUser = user?.wallet_type === 'external';
    const escrowAddress = (CONTRACTS as any)[chain]?.escrow;
    const effectiveAddress = (isExternalUser ? address : user?.wallet_address) as `0x${string}` | undefined;

    // 1. Check Vault Balance via wagmi (external wallet only)
    const { data: vaultBalance, isLoading: loadingVaultContract } = useReadContract({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: 'balances',
        args: effectiveAddress && tokenAddress ? [effectiveAddress, tokenAddress] : undefined,
        chainId: targetChainId,
        query: {
            enabled: !!effectiveAddress && !!tokenAddress && !!escrowAddress && type === 'sell' && isExternalUser
        }
    });

    // For internal bot wallet: fetch vault balance from backend API (reliable, uses server-side RPC)
    const [apiVaultBalance, setApiVaultBalance] = useState<string | undefined>(undefined);
    const [loadingApiVault, setLoadingApiVault] = useState(false);

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
    const { switchChainAsync } = useSwitchChain();
    const { showToast } = useToast();

    const TOKENS_BY_CHAIN: Record<string, string[]> = {
        base: ['USDT', 'USDC'],
        bsc: ['USDT', 'USDC', 'BNB']
    };

    const [reserved, setReserved] = useState(0);
    useEffect(() => {
        if (type === 'sell') {
            if (!isExternalUser) {
                // Internal bot wallet: use backend API for reliable vault balance
                setLoadingApiVault(true);
                api.wallet.getBalances().then(data => {
                    let vaultStr = '0';
                    let res = '0';
                    if (chain === 'base') {
                        vaultStr = (token === 'USDC' ? data.vault_base_usdc : data.vault_base_usdt) || '0';
                        res = (token === 'USDC' ? data.reserved_base_usdc : data.reserved_base_usdt) || '0';
                    } else {
                        vaultStr = (token === 'USDC' ? data.vault_bsc_usdc :
                            token === 'USDT' ? data.vault_bsc_usdt :
                                token === 'BNB' ? data.vault_bsc_bnb : '0') || '0';
                        res = (token === 'USDC' ? data.reserved_bsc_usdc :
                            token === 'USDT' ? data.reserved_bsc_usdt :
                                token === 'BNB' ? data.reserved_bsc_bnb : '0') || '0';
                    }
                    setApiVaultBalance(vaultStr);
                    setReserved(parseFloat(res));
                }).catch(console.error).finally(() => setLoadingApiVault(false));
            } else {
                // External wallet: just fetch reserved from API
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
        }
        // Fetch base fee from stats but override locally based on selected chain
        api.stats.get().then(data => {
            const baseFee = data.fee_percentage || 0.005;
            if (chain === 'base') {
                setFeePercentage(0);
            } else {
                setFeePercentage(baseFee === 0 ? 0.005 : baseFee); // Fallback to 0.5% if stats says 0 but we're on non-base
            }
        }).catch(console.error);
    }, [type, chain, token]);

    // ═══ EXTERNAL WALLET AUTO-FETCH ═══
    const isExt = user?.wallet_type === 'external' && isConnected && address;
    const baseUsdcAddr = (CONTRACTS as any).base.tokens.USDC;
    const baseUsdtAddr = (CONTRACTS as any).base.tokens.USDT;
    const bscUsdcAddr = (CONTRACTS as any).bsc.tokens.USDC;
    const bscUsdtAddr = (CONTRACTS as any).bsc.tokens.USDT;

    const { data: extBaseUsdc } = useReadContract({ address: baseUsdcAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: base.id, query: { enabled: !!isExt && !!baseUsdcAddr, refetchInterval: 5000 } });
    const { data: extBaseUsdt } = useReadContract({ address: baseUsdtAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: base.id, query: { enabled: !!isExt && !!baseUsdtAddr, refetchInterval: 5000 } });
    const { data: extBscUsdc } = useReadContract({ address: bscUsdcAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: bsc.id, query: { enabled: !!isExt && !!bscUsdcAddr, refetchInterval: 5000 } });
    const { data: extBscUsdt } = useReadContract({ address: bscUsdtAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: bsc.id, query: { enabled: !!isExt && !!bscUsdtAddr, refetchInterval: 5000 } });
    const { data: bscNativeBal } = useBalance({ address: address, chainId: bsc.id, query: { enabled: !!isExt, refetchInterval: 5000 } });

    const getExtBalance = (tok: string, ch: string) => {
        if (!isExt) return "0.00";
        if (ch === 'base') {
            const raw = tok === 'USDC' ? extBaseUsdc : extBaseUsdt;
            return raw ? formatUnits(raw as bigint, 6) : "0.00";
        } else {
            if (tok === 'BNB') return bscNativeBal?.value ? formatUnits(bscNativeBal.value, 18) : "0.00";
            const raw = tok === 'USDC' ? extBscUsdc : extBscUsdt;
            return raw ? formatUnits(raw as bigint, 18) : "0.00";
        }
    };

    // ═══ SMART NETWORK SWITCHER ═══
    async function smartSwitch(targetId: number) {
        if (currentChainId === targetId) return true;
        haptic('selection');
        setSubmitting(true);
        showToast(`Switching to ${targetId === bsc.id ? 'BSC' : 'Base'}...`, 'info');

        try {
            const switchPromise = switchChainAsync({ chainId: targetId });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SWITCH_TIMEOUT")), 8000));
            await Promise.race([switchPromise, timeoutPromise]);
            // Give wagmi a longer moment to update state in mobile wallets
            await new Promise(r => setTimeout(r, 1000));
            showToast("Network Switched!", "success");
            setSubmitting(false);
            return true;
        } catch (err: any) {
            console.error("[SmartSwitch] Error:", err);
            const cleanMsg = formatError(err);
            showToast(cleanMsg, "error");
            setSubmitting(false);
            return false;
        }
    }

    // Use API vault balance for internal users (reliable), wagmi contract read for external
    const physicalBalance = isExternalUser
        ? (vaultBalance !== undefined ? parseFloat(formatUnits(vaultBalance as bigint, decimals)) : 0)
        : parseFloat(apiVaultBalance || '0');
    const availableBalance = physicalBalance - reserved;

    const isNative = (chain === 'bsc' && token === 'BNB') || (chain === 'base' && token === 'ETH');
    // Use a small epsilon (1e-6) to avoid floating point precision issues
    const hasLoadedBalance = isExternalUser ? vaultBalance !== undefined : apiVaultBalance !== undefined;
    const needsDeposit = type === 'sell' && hasLoadedBalance && amount &&
        availableBalance < (parseFloat(amount) - 0.000001);

    const needsApproval = !isNative && needsDeposit && isExternalUser && allowance !== undefined && amount &&
        parseFloat(formatUnits(allowance as bigint, decimals)) < parseFloat(amount);

    // Guard: Wait for balance info if sell, AND wait for connection if we know we are an external user
    const loadingVault = isExternalUser ? loadingVaultContract : loadingApiVault;
    const isDataLoading = (type === 'sell') && (loadingVault || (isExternalUser && (loadingAllowance || !isConnected)));

    function toggleMethod(m: string) {
        haptic('selection');
        setMethods(prev =>
            prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
        );
    }


    async function handleApprove() {
        if (!amount || !isExternalUser || !isConnected || !address) {
            if (isExternalUser && !isConnected) {
                showToast("Connect your wallet first", "warning");
                appKit.open();
            }
            return;
        }
        haptic('medium');
        setSubmitting(true);
        setError('');

        try {
            const switched = await smartSwitch(targetChainId);
            if (!switched) return;

            // Unlimited approval using maxUint256
            const currentEscrow = chain === 'bsc' ? "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a" : escrowAddress;
            const isBsc = chain === 'bsc';
            const gasPrice = isBsc ? parseUnits('0.06', 9) : undefined;

            setTxStep('approving');
            showToast(`Approving ${token} in wallet...`, 'info');
            const hash = await writeContractAsync({
                address: tokenAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [currentEscrow as `0x${string}`, maxUint256],
                gasPrice,
                gas: isBsc ? 100000n : undefined,
                dataSuffix: (chain === 'base' ? BASE_BUILDER_DATA_SUFFIX : undefined) as any
            });
            console.log('Approval Sent:', hash);
            await waitForTransactionReceipt(wagmiConfig, { hash });

            haptic('success');
            setApprovalDone(true);
            showToast("Approved successfully!", "success");
        } catch (err: any) {
            console.error(err);
            const cleanMsg = formatError(err);
            setError(cleanMsg);
            showToast(cleanMsg, "error");
            haptic('error');
        } finally {
            setSubmitting(false);
            setTxStep('idle');
        }
    }

    async function submit() {
        if (isDataLoading) return;

        // Connection Guard
        if (isExternalUser && (!isConnected || !address)) {
            showToast("Wallet disconnected. Please reconnect.", "warning");
            appKit.open();
            return;
        }

        // Check payment details setup
        const hasPaymentDetails = !!(
            user?.upi_id ||
            user?.phone_number ||
            user?.bank_account_number ||
            user?.digital_rupee_id ||
            user?.cdm_bank_number
        );
        if (!hasPaymentDetails) {
            const msg = "Please set up your payment details (UPI ID, Phone Number, or Bank Account) in your Profile before creating an ad.";
            setError(msg);
            showToast(msg, "error");
            haptic('error');
            return;
        }

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
                const currentEscrow = chain === 'bsc' ? "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a" : escrowAddress;

                const switched = await smartSwitch(targetChainId);
                if (!switched) return;

                const isBsc = chain === 'bsc';
                const gasPrice = isBsc ? parseUnits('0.06', 9) : undefined;

                // Deposit if needed (approval should already be done)
                if (needsDeposit) {
                    setTxStep('depositing');
                    showToast("Depositing in wallet...", "info");
                    const hash = await writeContractAsync({
                        address: currentEscrow as `0x${string}`,
                        abi: ESCROW_ABI,
                        functionName: 'deposit',
                        args: [tokenAddress as `0x${string}`, amountUnits],
                        value: isNative ? amountUnits : undefined,
                        gasPrice,
                        gas: isBsc ? 500000n : undefined,
                        dataSuffix: (chain === 'base' ? BASE_BUILDER_DATA_SUFFIX : undefined) as any
                    });
                    console.log('Deposit Sent:', hash);
                    await waitForTransactionReceipt(wagmiConfig, { hash });
                    showToast("Deposit confirmed!", "success");
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
                note: note.trim() || undefined,
                excluded_dealers: excludedDealerUsernames.join(',') || undefined,
                allowed_dealers: allowedDealerUsernames.join(',') || undefined,
                expires_in: expiryMinutes,
                new_traders_only: newTradersOnly,
                require_kyc: requireKyc,
            });

            haptic('success');
            navigate('/');
        } catch (err: any) {
            console.error(err);
            const cleanMsg = formatError(err);
            setError(cleanMsg);
            showToast(cleanMsg, "error");
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
                                    className={`btn-toggle-net flex-1 flex items-center justify-center gap-2 ${chain === 'base' ? 'active' : ''}`}
                                    onClick={() => { setChain('base'); setToken('USDT'); }}
                                >
                                    <IconChainBase size={18} />
                                    Base
                                </button>
                                <button
                                    className={`btn-toggle-net flex-1 flex items-center justify-center gap-2 ${chain === 'bsc' ? 'active' : ''}`}
                                    onClick={() => { setChain('bsc'); setToken('USDT'); }}
                                >
                                    <IconChainBsc size={18} />
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

                            {type === 'sell' && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', marginTop: '-4px' }}>
                                    <div style={{ 
                                        fontSize: '11px',
                                        color: hasLoadedBalance && availableBalance < parseFloat(amount || '0') ? 'var(--orange)' : 'var(--text-muted)'
                                    }}>
                                        {isExternalUser ? 'Wallet Available: ' : 'Vault Available: '}
                                        <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                                            {isExternalUser
                                                ? formatBal(getExtBalance(token, chain), token === 'BNB' ? 4 : 2)
                                                : (apiVaultBalance !== undefined ? formatBal(availableBalance, token === 'BNB' ? 4 : 2) : '...')
                                            } {token}
                                        </span>
                                        {!isExternalUser && reserved > 0 && (
                                            <span style={{ opacity: 0.7, marginLeft: '4px', fontSize: '10px' }}>
                                                ({formatBal(reserved, token === 'BNB' ? 4 : 2)} reserved)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {type === 'sell' && (
                                <div className="flex gap-2 mb-4 mt-2">
                                    {[25, 50, 75, 100].map(pct => (
                                        <button 
                                            key={pct} 
                                            className="btn-preset-sm flex-1" 
                                            onClick={() => {
                                                const val = availableBalance * (pct / 100);
                                                const formatted = token === 'BNB' ? val.toFixed(4) : val.toFixed(2);
                                                setAmount(parseFloat(formatted).toString());
                                            }}
                                            style={{ 
                                                fontSize: '11px', 
                                                padding: '6px 0', 
                                                background: 'rgba(255,255,255,0.05)', 
                                                color: 'var(--text-secondary)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '6px'
                                            }}
                                        >
                                            {pct === 100 ? 'MAX' : `${pct}%`}
                                        </button>
                                    ))}
                                </div>
                            )}

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

                            {/* Note for traders */}
                            <div className="co-section-title" style={{ marginTop: '16px' }}>7. Note <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '11px' }}>(optional)</span></div>
                            <textarea
                                className="co-textarea"
                                placeholder="e.g. UPI transfer only, no GPay. Trades above ₹10k only."
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                maxLength={200}
                                rows={3}
                                style={{ resize: 'none', lineHeight: '1.5' }}
                            />
                            {note && (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '2px' }}>
                                    {note.length}/200
                                </div>
                            )}

                            <div className="co-section-title" style={{ marginTop: '16px' }}>8. Ad Duration</div>
                            <div className="co-presets-row mb-2">
                                {[
                                    { label: '30m', val: 30 },
                                    { label: '1h', val: 60 },
                                    { label: '6h', val: 360 },
                                    { label: '12h', val: 720 },
                                    { label: '7d', val: 10080 }
                                ].map(opt => (
                                    <button
                                        key={opt.val}
                                        className={`btn-preset-sm ${expiryMinutes === opt.val ? 'active' : ''}`}
                                        onClick={() => { haptic('selection'); setExpiryMinutes(opt.val); }}
                                        style={{ minWidth: '60px' }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <div className="text-[10px] text-muted mb-2">
                                Ad will automatically cancel after this time.
                            </div>

                            <div className="co-section-title" style={{ marginTop: '16px' }}>9. Advanced Settings</div>
                            <div 
                                onClick={() => { haptic('selection'); setIsAdvancedSettingsExpanded(!isAdvancedSettingsExpanded); }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: isAdvancedSettingsExpanded ? '8px 8px 0 0' : '8px', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ fontSize: '14px' }}>⚙️</div>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>Advanced Settings</div>
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '16px', transform: isAdvancedSettingsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>›</div>
                            </div>
                            
                            {isAdvancedSettingsExpanded && (
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', borderRadius: '0 0 8px 8px', animation: 'slideDown 0.2s ease-out' }}>
                                    {/* KYC Verified Only Toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>KYC Verified Only</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Only traders with verified identity</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { haptic('selection'); setRequireKyc(!requireKyc); }}
                                            style={{
                                                background: requireKyc ? '#f0b90b' : 'rgba(255,255,255,0.1)',
                                                color: requireKyc ? '#000' : '#fff',
                                                border: 'none',
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                fontSize: '10px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {requireKyc ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    {/* New Traders Only Toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>New Traders Only</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Only 0 trade users</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { haptic('selection'); setNewTradersOnly(!newTradersOnly); }}
                                            style={{
                                                background: newTradersOnly ? 'var(--green)' : 'rgba(255,255,255,0.1)',
                                                color: newTradersOnly ? '#000' : '#fff',
                                                border: 'none',
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                fontSize: '10px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {newTradersOnly ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    {/* Specific Dealers Only (Whitelist) */}
                                    <div style={{ paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: allowedDealerUsernames.length > 0 ? '8px' : '0' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Specific Dealers Only</div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Only selected users can take this ad</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { haptic('selection'); setDealerSelectionMode('allow'); }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 8px',
                                                    background: 'rgba(52, 199, 89, 0.1)',
                                                    border: '1px dashed rgba(52, 199, 89, 0.3)',
                                                    color: 'var(--green)',
                                                    borderRadius: '6px',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                + Add
                                            </button>
                                        </div>

                                        {allowedDealerUsernames.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                                {allowedDealerUsernames.map(username => (
                                                    <div
                                                        key={username}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '2px 8px',
                                                            background: 'rgba(52, 199, 89, 0.15)',
                                                            border: '1px solid rgba(52, 199, 89, 0.3)',
                                                            borderRadius: '100px',
                                                            fontSize: '10px',
                                                            color: 'var(--green)'
                                                        }}
                                                    >
                                                        @{username}
                                                        <div 
                                                            onClick={() => setAllowedDealerUsernames(prev => prev.filter(x => x !== username))}
                                                            style={{ cursor: 'pointer', background: 'rgba(52, 199, 89, 0.2)', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px' }}
                                                        >
                                                            ✕
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Exclude Specific Dealers */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: excludedDealerUsernames.length > 0 ? '8px' : '0' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Block Dealers</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { haptic('selection'); setDealerSelectionMode('exclude'); }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 8px',
                                                    background: 'rgba(255, 69, 58, 0.1)',
                                                    border: '1px dashed rgba(255, 69, 58, 0.3)',
                                                    color: '#ff453a',
                                                    borderRadius: '6px',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                + Add
                                            </button>
                                        </div>

                                        {excludedDealerUsernames.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                                {excludedDealerUsernames.map(username => (
                                                    <div
                                                        key={username}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '2px 8px',
                                                            background: 'rgba(255, 69, 58, 0.15)',
                                                            border: '1px solid rgba(255, 69, 58, 0.3)',
                                                            borderRadius: '100px',
                                                            fontSize: '10px',
                                                            color: '#ff453a'
                                                        }}
                                                    >
                                                        @{username}
                                                        <div 
                                                            onClick={() => setExcludedDealerUsernames(prev => prev.filter(x => x !== username))}
                                                            style={{ cursor: 'pointer', background: 'rgba(255,69,58,0.2)', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px' }}
                                                        >
                                                            ✕
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
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
                                    <span>Trading Fee ({feePercentage === 0 ? '0%' : (feePercentage * 100).toFixed(2) + '%'})</span>
                                    <span>{feePercentage === 0 ? 'Free Promotion' : `${(feePercentage * 50).toFixed(2)}% Buyer + ${(feePercentage * 50).toFixed(2)}% Seller`}</span>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                        <span>⚠️</span>
                        <span style={{ flex: 1 }}>{error}</span>
                        {(error.toLowerCase().includes('profile') || error.toLowerCase().includes('payment')) && (
                            <button
                                type="button"
                                onClick={() => navigate('/profile')}
                                style={{
                                    padding: '6px 12px',
                                    background: 'var(--primary, #f3ba2f)',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    marginLeft: 'auto'
                                }}
                            >
                                Go to Profile ➡️
                            </button>
                        )}
                    </div>
                </div>
            )}
            
            {/* Dealers Search Full Screen Modal */}
            {dealerSelectionMode !== null && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 999999,
                    background: 'var(--bg-main)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{dealerSelectionMode === 'exclude' ? 'Block Dealers' : 'Allow Specific Dealers'}</div>
                        <button onClick={() => setDealerSelectionMode(null)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '14px', fontWeight: 'bold' }}>Done</button>
                    </div>
                    
                    <div style={{ padding: '12px 16px' }}>
                        <input 
                            type="text" 
                            placeholder="Search username..." 
                            value={excludeSearchQuery}
                            onChange={e => setExcludeSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                color: '#fff',
                                outline: 'none',
                                fontSize: '14px'
                            }}
                        />
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
                        {allUsers.filter(u => u.username.toLowerCase().includes(excludeSearchQuery.toLowerCase())).map(u => {
                            const isSelected = dealerSelectionMode === 'exclude' 
                                ? excludedDealerUsernames.includes(u.username)
                                : allowedDealerUsernames.includes(u.username);
                            
                            const activeColor = dealerSelectionMode === 'exclude' ? '#ff453a' : 'var(--green)';

                            return (
                                <div
                                    key={u.id}
                                    onClick={() => {
                                        haptic('selection');
                                        if (dealerSelectionMode === 'exclude') {
                                            setExcludedDealerUsernames(prev =>
                                                prev.includes(u.username) ? prev.filter(x => x !== u.username) : [...prev, u.username]
                                            );
                                        } else {
                                            setAllowedDealerUsernames(prev =>
                                                prev.includes(u.username) ? prev.filter(x => x !== u.username) : [...prev, u.username]
                                            );
                                        }
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '16px 0',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {u.photo_url ? (
                                            <img src={u.photo_url} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                                        ) : (
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #ff4d4d, #f43f5e)', color: '#fff', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {u.username.substring(0, 1).toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <div style={{ fontSize: '15px', color: isSelected ? activeColor : '#fff', fontWeight: isSelected ? 'bold' : 'normal' }}>@{u.username}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{u.completed_trades || 0} trades</div>
                                        </div>
                                    </div>
                                    
                                    <div style={{
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        border: `2px solid ${isSelected ? activeColor : 'rgba(255,255,255,0.2)'}`,
                                        background: isSelected ? activeColor : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        {isSelected && <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>✓</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
