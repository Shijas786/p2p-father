import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount, useSwitchChain, useChainId } from 'wagmi';
import { parseUnits } from 'viem';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { sounds } from '../lib/sounds';
import { CONTRACTS, ERC20_ABI } from '../lib/contracts';
import { copyToClipboard } from '../lib/utils';
import { appKit } from '../lib/wagmi';
import { useToast } from '../components/Toast';
import { TraderProfile } from '../components/TraderProfile';
import { CompactStats } from '../components/CompactStats';
import { bsc, base } from 'wagmi/chains';
import './TradeDetail.css';

// createTrade ABI extension (not in shared contracts.ts)
const ESCROW_CREATE_TRADE_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "buyer", "type": "address" },
            { "internalType": "address", "name": "token", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "uint256", "name": "duration", "type": "uint256" }
        ],
        "name": "createTrade",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "payable",
        "type": "function"
    }
] as const;

const STEPS = [
    { key: 'waiting_for_escrow', label: 'Lock Funds', icon: '⏳' },
    { key: 'in_escrow', label: 'Escrow Locked', icon: '🔒' },
    { key: 'fiat_sent', label: 'Fiat Sent', icon: '💸' },
    { key: 'fiat_confirmed', label: 'Fiat Confirmed', icon: '✅' },
    { key: 'completed', label: 'Completed', icon: '🎉' },
];

interface Props {
    user: any;
}

export function TradeDetail({ user }: Props) {
    const { id, orderId } = useParams<{ id: string; orderId: string }>();
    const navigate = useNavigate();
    const { address: externalAddress, isConnected } = useAccount();

    // State
    const [trade, setTrade] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>(undefined);
    const [lockTxHash, setLockTxHash] = useState<`0x${string}` | undefined>(undefined);
    const [order, setOrder] = useState<any>(null);
    const [feePercentage, setFeePercentage] = useState<number>(0.005);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const prevStatusRef = useRef<string | null>(null);
    const actionSectionRef = useRef<HTMLDivElement>(null);
    const [showProfileId, setShowProfileId] = useState<string | null>(null);
    const [showInlineStats, setShowInlineStats] = useState(false);

    // Wagmi Hooks
    const { writeContractAsync } = useWriteContract();
    // const { chain: walletChain } = useAccount(); // Still needed for some UI perhaps, but useChainId for logic
    const currentChainId = useChainId();
    const { switchChainAsync } = useSwitchChain();
    const { showToast } = useToast();

    const formatBal = (val: any, decs = 2) => {
        const num = parseFloat(val || '0');
        if (num > 0 && num < 0.0001) return '0.00';
        if (num === 0) return '0.00';
        return num.toFixed(decs);
    };

    // Chain-aware contract addresses
    const tradeChain = (trade?.chain || order?.chain || 'base') as 'base' | 'bsc';
    const escrowAddress = (CONTRACTS[tradeChain]?.escrow || CONTRACTS.base.escrow) as `0x${string}`;
    const tokenAddress = ((CONTRACTS[tradeChain]?.tokens as any)?.[trade?.token || 'USDC'] || CONTRACTS.base.tokens.USDC) as `0x${string}`;

    // Check Allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: externalAddress && trade ? [externalAddress, escrowAddress] : undefined,
        query: { enabled: !!externalAddress && !!trade, refetchInterval: 5000 }
    });

    // Validations
    const isSeller = user?.id === trade?.seller_id;
    const isExternalWallet = user?.wallet_type === 'external';
    // const needsApproval = trade && allowance !== undefined && allowance < parseUnits(trade.amount.toString(), 6);
    // TypeScript fix for allowance comparison:
    const isNative = trade?.token === 'BNB' || order?.token === 'BNB';
    const tradeDecimals = (tradeChain === 'bsc') ? 18 : 6;
    const tradeAmountBigInt = (trade || order) ? parseUnits((trade || order).amount.toString(), tradeDecimals) : BigInt(0);
    const needsApproval = !isNative && allowance !== undefined && allowance < tradeAmountBigInt;

    useEffect(() => {
        if (id) {
            loadTrade();
            loadMessages();
            // Polling
            const interval = setInterval(() => {
                refreshData();
            }, 10000);
            return () => clearInterval(interval);
        } else if (orderId) {
            loadOrder();
        }
        // Fetch fee
        api.stats.get().then(data => {
            if (data.fee_percentage) setFeePercentage(data.fee_percentage);
        }).catch(console.error);
    }, [id, orderId]);

    const [disputeTimer, setDisputeTimer] = useState<number>(0);

    useEffect(() => {
        if (trade && trade.fiat_sent_at) {
            const calculateTime = () => {
                const sentTime = new Date(trade.fiat_sent_at).getTime();
                const now = Date.now();
                const diff = now - sentTime;
                const oneHour = 60 * 60 * 1000;

                if (diff < oneHour) {
                    setDisputeTimer(oneHour - diff);
                } else {
                    setDisputeTimer(0);
                }
            };

            calculateTime();
            const interval = setInterval(calculateTime, 1000);
            return () => clearInterval(interval);
        }
    }, [trade]);

    async function refreshData() {
        if (!id) return;
        try {
            const { trade: data } = await api.trades.getById(id);
            // Detect status change and trigger feedback
            if (prevStatusRef.current && data.status !== prevStatusRef.current) {
                haptic('success');
                if (data.status === 'completed') {
                    sounds.play('trade_complete');
                } else if (data.status === 'disputed') {
                    sounds.play('dispute');
                } else {
                    sounds.play('notification');
                }
                // Auto-scroll to action section
                setTimeout(() => {
                    actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
            prevStatusRef.current = data.status;
            setTrade(data);

            const { messages: msgs } = await api.trades.getMessages(id);
            // Play sound for new messages from counterparty
            if (msgs.length > messages.length) {
                const latest = msgs[msgs.length - 1];
                if (latest.user_id !== user.id) {
                    sounds.play('notification');
                }
            }
            setMessages(msgs);
        } catch (err) {
            console.error('Polling error:', err);
        }
    }

    async function loadOrder() {
        if (!orderId) return;
        setLoading(true);
        try {
            const { order: data } = await api.orders.getById(orderId);
            setOrder(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load order');
        } finally {
            setLoading(false);
        }
    }

    async function loadTrade() {
        if (!id) return;
        setLoading(true);
        try {
            const { trade: data } = await api.trades.getById(id);
            setTrade(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load trade');
        } finally {
            setLoading(false);
        }
    }

    async function loadMessages() {
        if (!id) return;
        try {
            const { messages: data } = await api.trades.getMessages(id);
            setMessages(data);
        } catch (err) {
            console.error('Failed to load messages:', err);
        }
    }

    async function handleSendMessage() {
        if (!id || (!newMessage.trim() && !selectedImage)) return;
        setSendingMessage(true);
        try {
            if (selectedImage) {
                // Upload image
                setUploadingImage(true);
                await api.trades.uploadImage(id, selectedImage, newMessage.trim() || undefined);
                setSelectedImage(null);
                setImagePreview(null);
                setUploadingImage(false);
            } else {
                await api.trades.sendMessage(id, newMessage);
            }
            setNewMessage('');
            haptic('light');
            await loadMessages();
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (err: any) {
            setError(err.message);
            setUploadingImage(false);
        } finally {
            setSendingMessage(false);
        }
    }

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be under 5MB');
            return;
        }
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(file);
    }

    function clearSelectedImage() {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function handleCreateTrade() {
        if (!order) return;
        const minAmount = order.token === 'BNB' ? 0.001 : 1.0;
        // Float precision fix (1 - 0.000001 < 1.0)
        if (order.amount < (minAmount - 0.000001)) {
            setError(`Minimum trade amount is ${minAmount} ${order.token}`);
            haptic('error');
            return;
        }
        haptic('heavy');
        setActionLoading(true);
        setError('');
        try {
            const { trade: newTrade } = await api.trades.create(order.id, order.amount);
            haptic('success');
            navigate(`/trade/${newTrade.id}`, { replace: true });
        } catch (err: any) {
            setError(err.message || 'Failed to initiate trade');
            haptic('error');
        } finally {
            setActionLoading(false);
        }
    }
    // ═══ SMART NETWORK SWITCHER ═══
    async function smartSwitch(targetId: number) {
        if (currentChainId === targetId) return true;
        haptic('selection');
        setActionLoading(true);
        showToast(`Switching to ${targetId === bsc.id ? 'BSC' : 'Base'}...`, 'info');

        try {
            const switchPromise = switchChainAsync({ chainId: targetId });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SWITCH_TIMEOUT")), 8000));
            await Promise.race([switchPromise, timeoutPromise]);
            // Give wagmi a longer moment to update state in mobile wallets
            await new Promise(r => setTimeout(r, 1000));
            showToast("Network Switched!", "success");
            setActionLoading(false);
            return true;
        } catch (err: any) {
            console.error("[SmartSwitch] Error:", err);
            if (err.message === "SWITCH_TIMEOUT" || (err.code && err.code !== 4001)) {
                showToast("Wallet unresponsive. Please switch manually.", "warning");
                appKit.open({ view: 'Networks' });
            } else if (err.code === 4001) {
                showToast("Switch rejected by user", "error");
            } else {
                showToast("Switch failed. Try the network menu.", "error");
                appKit.open({ view: 'Networks' });
            }
            setActionLoading(false);
            return false;
        }
    }

    // 1. Approve Token
    async function handleApprove() {
        if (isExternalWallet && (!externalAddress || !isConnected)) {
            showToast("Connect your wallet first", "warning");
            appKit.open();
            return;
        }
        const targetChainId = tradeChain === 'bsc' ? bsc.id : base.id;
        const switched = await smartSwitch(targetChainId);
        if (!switched) return;

        haptic('medium');
        setActionLoading(true);
        setError('');
        try {
            const isBsc = tradeChain === 'bsc';
            const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

            showToast(`Approving ${trade.token} in wallet...`, 'info');
            const hash = await writeContractAsync({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [escrowAddress, tradeAmountBigInt],
                gasPrice,
                gas: isBsc ? 100000n : undefined
            });
            setApproveTxHash(hash);
            console.log('Approve TX:', hash);
            haptic('success');
            showToast("Approval sent!", "success");
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Approval failed');
            haptic('error');
        } finally {
            setActionLoading(false);
        }
    }

    // 2. Lock Funds (Create Trade on Chain)
    async function handleLockFunds() {
        if (isExternalWallet && (!externalAddress || !isConnected)) {
            showToast("Connect your wallet first", "warning");
            appKit.open();
            return;
        }
        const targetChainId = tradeChain === 'bsc' ? bsc.id : base.id;
        const switched = await smartSwitch(targetChainId);
        if (!switched) return;

        haptic('heavy');
        setActionLoading(true);
        setError('');
        try {
            // Duration: 1 hour (3600 seconds)
            const duration = BigInt(3600);

            const isBsc = tradeChain === 'bsc';
            const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

            showToast("Locking funds in wallet...", "info");
            const hash = await writeContractAsync({
                address: escrowAddress,
                abi: ESCROW_CREATE_TRADE_ABI,
                functionName: 'createTrade',
                args: [
                    (trade.buyer_wallet_address || '0x0000000000000000000000000000000000000000') as `0x${string}`,
                    tokenAddress,
                    tradeAmountBigInt,
                    duration
                ],
                gasPrice,
                gas: isBsc ? 500000n : undefined,
                value: isNative ? (tradeAmountBigInt as bigint) : 0n
            });
            setLockTxHash(hash);
            console.log('Lock TX:', hash);
            showToast("Lock transaction sent!", "success");
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Lock failed');
            haptic('error');
        } finally {
            setActionLoading(false);
        }
    }

    // Watch Appove receipt
    const { isSuccess: isApproveSuccess, isLoading: isApproveLoading } = useWaitForTransactionReceipt({
        hash: approveTxHash,
    });

    // Watch Lock receipt
    const { isSuccess: isLockSuccess, isLoading: isLockLoading } = useWaitForTransactionReceipt({
        hash: lockTxHash,
    });

    // Effect: Refetch allowance after approval
    useEffect(() => {
        if (isApproveSuccess) {
            refetchAllowance();
            haptic('success');
        }
    }, [isApproveSuccess]);

    // Effect: Update backend after Lock success
    useEffect(() => {
        if (isLockSuccess && lockTxHash) {
            confirmLockBackend(lockTxHash);
        }
    }, [isLockSuccess]);

    async function confirmLockBackend(hash: string) {
        if (!id) return;
        try {
            await api.trades.lock(id, hash);
            haptic('success');
            loadTrade(); // Refresh UI
        } catch (err) {
            console.error(err);
            setError('Failed to update backend. Please contact support with TX: ' + hash);
        } finally {
            setActionLoading(false);
        }
    }

    async function confirmPayment() {
        if (!id) return;
        haptic('medium');
        setActionLoading(true);
        setError('');
        try {
            await api.trades.confirmPayment(id, "NOT_PROVIDED");
            haptic('success');
            await loadTrade();
        } catch (err: any) {
            setError(err.message);
            haptic('error');
        } finally {
            setActionLoading(false);
        }
    }

    async function confirmReceipt() {
        if (!id) return;
        haptic('medium');
        setActionLoading(true);
        setError('');
        try {
            await api.trades.confirmReceipt(id);
            haptic('success');
            sounds.play('trade_complete');
            await loadTrade();
        } catch (err: any) {
            setError(err.message);
            haptic('error');
        } finally {
            setActionLoading(false);
        }
    }

    async function raiseDispute() {
        if (!id) return;
        haptic('heavy');
        const reason = prompt('Describe the issue:');
        if (!reason) return;
        setActionLoading(true);
        try {
            await api.trades.dispute(id, reason);
            haptic('warning');
            sounds.play('dispute');
            await loadTrade();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    }


    function getStepIndex(status: string): number {
        const idx = STEPS.findIndex(s => s.key === status);
        return idx >= 0 ? idx : (status === 'completed' ? 4 : -1);
    }

    const showLockUI = trade?.status === 'waiting_for_escrow';

    if (loading) {
        return (
            <div className="page">
                <div className="skeleton" style={{ height: 200 }} />
                <div className="skeleton mt-3" style={{ height: 100 }} />
            </div>
        );
    }

    if (!trade && !order) {
        return (
            <div className="page">
                <div className="empty-state">
                    <div className="icon">❓</div>
                    <h3>{orderId ? 'Order' : 'Trade'} not found</h3>
                    {error && <p className="text-red text-xs mt-2">{error}</p>}
                    <button className="btn btn-primary btn-sm mt-3" onClick={() => navigate('/')}>
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    // Use order details during initiation
    const disp = trade || order;
    const currentStep = trade ? getStepIndex(trade.status) : -1;

    return (
        <div className="page animate-in">
            <div className="page-header">
                <div className="flex items-center justify-between">
                    <h1 className="page-title">Trade</h1>
                    <span className="font-mono text-xs text-muted">#{disp.id.slice(0, 8)}</span>
                </div>
            </div>

            {/* Amount Card */}
            <div className="td-amount-card card-glass glow-green">
                <div className="td-amount font-mono">
                    {formatBal(disp.amount, disp.token === 'BNB' ? 4 : 2)} <span className="text-muted">{disp.token}</span>
                </div>
                <div className="td-fiat font-mono text-secondary mb-2">
                    ₹{disp.fiat_amount?.toLocaleString() || (disp.amount * disp.rate).toLocaleString()} @ ₹{disp.rate?.toLocaleString()}
                </div>

                {/* Fee Breakdown */}
                {/* Fee Breakdown (Dynamic) */}
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                    {(() => {
                        const amount = parseFloat(disp.amount);
                        const rate = parseFloat(disp.rate || 0);
                        const feePercent = feePercentage || 0.005;

                        const sellerLock = amount.toFixed(4);
                        // Fiat Amount is what Buyer sends and Seller receives
                        // It corresponds to 99.5% of the crypto amount
                        const fiatValue = (amount * (1 - (feePercent / 2)) * rate).toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                            minimumFractionDigits: 2
                        });

                        const buyerGets = (amount * (1 - feePercent)).toFixed(4);

                        const isUserSeller = trade
                            ? user?.id === trade.seller_id
                            : (order ? (order.type === 'sell' ? user?.id === order.user_id : user?.id !== order.user_id) : false);

                        return (
                            <>
                                {isUserSeller ? (
                                    // SELLER VIEW
                                    <>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted">You Sell</span>
                                            <span className="font-mono text-white">{sellerLock} {disp.token}</span>
                                        </div>
                                        <div className="pt-2 border-t border-white/5">
                                            <div className="text-secondary text-xs mb-1">You Receive</div>
                                            <div className="text-2xl font-bold text-green font-mono">
                                                ₹ {fiatValue}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            (0.25% fee deducted)
                                        </div>
                                    </>
                                ) : (
                                    // BUYER VIEW
                                    <>
                                        <div className="pt-2 pb-3 border-b border-white/5 mb-2">
                                            <div className="text-secondary text-xs mb-1">You Pay</div>
                                            <div className="text-2xl font-bold text-white font-mono">
                                                ₹ {fiatValue}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted">You Receive</span>
                                            <span className="font-mono text-green font-bold">{buyerGets} {disp.token}</span>
                                        </div>
                                        <div className="text-[10px] text-right text-gray-500 mt-1">
                                            (0.25% fee deducted)
                                        </div>
                                    </>
                                )}
                            </>
                        );
                    })()}
                </div>

                {orderId && (
                    <div className="mt-4">
                        <button
                            className="btn btn-primary btn-block btn-lg glow-green"
                            onClick={handleCreateTrade}
                            disabled={actionLoading}
                        >
                            {actionLoading ? <span className="spinner" /> : `Confirm & Start ${disp.type === 'sell' ? 'Buy' : 'Sell'}`}
                        </button>
                        <p className="text-[10px] text-muted text-center mt-2">
                            By clicking confirm, you agree to start a secure P2P trade.
                        </p>
                    </div>
                )}

                {showLockUI && isSeller && (
                    <div className="mt-2 p-2 bg-warning-soft rounded text-sm text-warning">
                        Action Required: Lock funds ({trade.amount} {trade.token}) to start escrow.
                    </div>
                )}
            </div>

            {/* Progress Steps */}
            <div className="td-steps">
                {STEPS.map((step, i) => (
                    <div key={step.key} className={`td-step ${i <= currentStep ? 'done' : ''} ${i === currentStep ? 'current' : ''}`}>
                        <div className="td-step-dot">
                            {i <= currentStep ? step.icon : <span className="td-step-num">{i + 1}</span>}
                        </div>
                        <span className="td-step-label">{step.label}</span>
                        {i < STEPS.length - 1 && <div className="td-step-line" />}
                    </div>
                ))}
            </div>

            {/* Actions for External Wallet Locking */}
            {showLockUI && isSeller && isExternalWallet && (
                <div className="p-section card border-yellow">
                    <h3 className="mb-2">🔒 Escrow Lock</h3>
                    <p className="text-sm text-muted mb-3">
                        You must lock <b>{trade.amount} {trade.token}</b> in the smart contract.
                    </p>
                    {needsApproval ? (
                        <button
                            className="btn btn-primary btn-block"
                            onClick={handleApprove}
                            disabled={actionLoading || isApproveLoading}
                        >
                            {(actionLoading || isApproveLoading) ? <span className="spinner" /> : `Approve ${trade.token}`}
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary btn-block"
                            onClick={handleLockFunds}
                            disabled={actionLoading || isLockLoading}
                        >
                            {(actionLoading || isLockLoading) ? <span className="spinner" /> : `Lock Funds Now`}
                        </button>
                    )}
                    {error && <div className="text-red text-xs mt-2">{error}</div>}
                </div>
            )}

            {showLockUI && isSeller && !isExternalWallet && (
                <div className="p-section card border-red">
                    <h3 className="text-red">⚠️ Error</h3>
                    <p className="text-sm">You are in a Glitch State. Please contact support. Bot wallets should auto-lock.</p>
                </div>
            )}

            {showLockUI && !isSeller && (
                <div className="p-section card">
                    <h3 className="mb-2">⏳ Waiting for Seller</h3>
                    <div className="loading-dots">Seller is locking funds...</div>
                </div>
            )}

            {(trade || order) && (
                <div
                    className="px-4 mb-4 flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 mx-4 active:bg-white/10 transition-colors cursor-pointer"
                    onClick={() => {
                        let targetId = null;
                        const isTradeSeller = trade ? user?.id === trade.seller_id : false;
                        if (trade) {
                            targetId = isTradeSeller ? trade.buyer_id : trade.seller_id;
                        } else if (order) {
                            if (user?.id !== order.user_id) {
                                targetId = order.user_id;
                            }
                        }
                        if (targetId) {
                            haptic('light');
                            setShowProfileId(targetId);
                        }
                    }}
                >
                    <div className="flex items-center gap-3">
                        {/* Determine Counterparty */}
                        {(() => {
                            let cpName = 'Anonymous';
                            let cpPhoto = null;
                            let cpUsername = null;
                            const isTradeSeller = trade ? user?.id === trade.seller_id : false;
                            let cpUserId = null;

                            if (trade) {
                                cpUserId = isTradeSeller ? trade.buyer_id : trade.seller_id;
                                if (isTradeSeller) { // I am Seller, CP is Buyer
                                    cpName = trade.buyer_username || trade.buyer_first_name || 'Buyer';
                                    cpPhoto = trade.buyer_photo_url;
                                    cpUsername = trade.buyer_username;
                                } else { // I am Buyer, CP is Seller
                                    cpName = trade.seller_username || trade.seller_first_name || 'Seller';
                                    cpPhoto = trade.seller_photo_url;
                                    cpUsername = trade.seller_username;
                                }
                            } else if (order) {
                                // Viewing Order (I am potential Taker)
                                cpUserId = order.user_id;
                                if (user?.id === order.user_id) {
                                    cpName = 'You';
                                    cpPhoto = user.photo_url;
                                } else {
                                    cpName = order.username || order.first_name || 'Maker';
                                    cpPhoto = order.photo_url;
                                    cpUsername = order.username;
                                }
                            }

                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: '50%', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
                                        {cpPhoto ? (
                                            <img src={cpPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                        ) : (
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#9ca3af' }}>{cpName[0]?.toUpperCase()}</span>
                                        )}
                                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #000', background: trade ? '#22c55e' : '#6b7280' }}></div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div 
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                haptic('light');
                                                setShowInlineStats(!showInlineStats);
                                            }}
                                        >
                                            <span style={{ fontWeight: 700, color: '#fff', fontSize: '14px' }}>{cpName}</span>
                                            <span style={{ 
                                                fontSize: '10px', 
                                                color: 'var(--green)', 
                                                opacity: 0.8,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '2px'
                                            }}>
                                                {showInlineStats ? 'Hide Stats' : 'View Stats'}
                                                <span style={{ 
                                                    display: 'inline-block', 
                                                    transition: 'transform 0.2s',
                                                    transform: showInlineStats ? 'rotate(90deg)' : 'rotate(0deg)',
                                                    fontSize: '12px'
                                                }}>›</span>
                                            </span>
                                        </div>
                                        {showInlineStats && cpUserId && (
                                            <CompactStats userId={cpUserId} />
                                        )}
                                        <div style={{ fontSize: '10px', color: '#848e9c', display: 'flex', alignItems: 'center', gap: '4px', marginTop: showInlineStats ? '6px' : '0' }}>
                                            {trade ? (
                                                <span className={`status-badge ${trade.status}`} style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9px' }}>
                                                    {trade.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            ) : (
                                                <span>Verified Trader</span>
                                            )}
                                            {cpUsername && <span style={{ color: '#4b5563' }}>@{cpUsername}</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Standard Actions (Fiat Sent, Release, Dispute) */}
            <div ref={actionSectionRef}>
                {/* Disputed Status UI */}
                {trade && trade.status === 'disputed' && (
                    <div className="card border-red p-4 text-center animate-in mb-4">
                        <div className="text-4xl mb-2">⚠️</div>
                        <h3 className="text-red font-bold uppercase">Trade Under Dispute</h3>
                        <p className="text-sm text-muted mt-2">
                            Admin has been notified and will review this case in the chat below.
                            Please provide any evidence (screenshots, UTR, etc.) via the chat.
                        </p>
                    </div>
                )}

                <div className="td-actions">
                    {trade && trade.status === 'in_escrow' && !isSeller && (
                        <div className="card-glass border-green p-3 animate-in">
                            <h4 className="mb-2 text-sm font-bold uppercase tracking-wider">📤 Confirm Transfer</h4>

                            {/* Seller Payment Details */}
                            {trade.seller_digital_rupee_id && (
                                <div className="bg-white/5 rounded p-3 mb-2 border border-blue/30">
                                    <div className="text-[10px] text-blue uppercase font-bold mb-1">💳 Digital Rupee (e₹)</div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-lg text-white select-all">{trade.seller_digital_rupee_id}</span>
                                        <button className="btn btn-xs btn-outline" onClick={async () => {
                                            const success = await copyToClipboard(trade.seller_digital_rupee_id || '');
                                            if (success) haptic('success');
                                        }}>Copy</button>
                                    </div>
                                </div>
                            )}

                            {trade.seller_upi_id && (
                                <div className="bg-white/5 rounded p-3 mb-2 border border-white/10">
                                    <div className="text-[10px] text-muted uppercase font-bold mb-1">📱 Pay to UPI ID</div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-lg text-white select-all">{trade.seller_upi_id}</span>
                                        <button className="btn btn-xs btn-outline" onClick={async () => {
                                            const success = await copyToClipboard(trade.seller_upi_id || '');
                                            if (success) haptic('success');
                                        }}>Copy</button>
                                    </div>
                                </div>
                            )}

                            {trade.seller_phone && (
                                <div className="bg-white/5 rounded p-3 mb-2 border border-white/10">
                                    <div className="text-[10px] text-muted uppercase font-bold mb-1">📞 Phone Number</div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-lg text-white select-all">{trade.seller_phone}</span>
                                        <button className="btn btn-xs btn-outline" onClick={async () => {
                                            const success = await copyToClipboard(trade.seller_phone || '');
                                            if (success) haptic('success');
                                        }}>Copy</button>
                                    </div>
                                </div>
                            )}

                            {trade.seller_bank_account && (
                                <div className="bg-white/5 rounded p-3 mb-2 border border-white/10">
                                    <div className="text-[10px] text-muted uppercase font-bold mb-1">🏦 Bank Transfer (IMPS)</div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-sm text-white select-all">{trade.seller_bank_account}</span>
                                        <button className="btn btn-xs btn-outline" onClick={async () => {
                                            const success = await copyToClipboard(trade.seller_bank_account || '');
                                            if (success) haptic('success');
                                        }}>Copy</button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted">IFSC: <span className="font-mono text-white select-all">{trade.seller_bank_ifsc}</span></span>
                                        <button className="btn btn-xs btn-outline" onClick={async () => {
                                            const success = await copyToClipboard(trade.seller_bank_ifsc || '');
                                            if (success) haptic('success');
                                        }}>Copy</button>
                                    </div>
                                    {trade.seller_bank_name && (
                                        <div className="text-xs text-muted mt-1">Bank: {trade.seller_bank_name}</div>
                                    )}
                                </div>
                            )}

                            {trade.seller_cdm_bank_number && (
                                <div className="bg-white/5 rounded p-3 mb-2 border border-blue/30">
                                    <div className="text-[10px] text-blue uppercase font-bold mb-1">🏦 CDM (Cash Deposit)</div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-sm text-white select-all">{trade.seller_cdm_bank_number}</span>
                                        <button className="btn btn-xs btn-outline" onClick={async () => {
                                            const success = await copyToClipboard(trade.seller_cdm_bank_number || '');
                                            if (success) haptic('success');
                                        }}>Copy</button>
                                    </div>
                                    <div className="text-xs text-muted mt-1">
                                        <div>Bank: <span className="text-white">{trade.seller_cdm_bank_name}</span></div>
                                        <div>Name: <span className="text-white">{trade.seller_cdm_user_name}</span></div>
                                        <div>Phone: <span className="text-white">{trade.seller_cdm_phone}</span></div>
                                    </div>
                                </div>
                            )}

                            {!trade.seller_upi_id && !trade.seller_phone && !trade.seller_bank_account && (
                                <div className="bg-white/5 rounded p-3 mb-2 border border-orange/30">
                                    <div className="text-sm text-orange">⚠️ Seller has not set up payment details yet. Contact them via chat.</div>
                                </div>
                            )}

                            <div className="text-[10px] text-orange mt-1 mb-3">Pay exactly ₹{trade.fiat_amount}</div>


                            <p className="text-xs text-muted mb-3">Please transfer exactly <b>₹{trade.fiat_amount}</b> to the seller using one of the payment methods above.</p>

                            <button
                                className="btn btn-primary btn-block btn-lg"
                                onClick={confirmPayment}
                                disabled={actionLoading}
                            >
                                {actionLoading ? <span className="spinner" /> : '💸 I have sent the payment'}
                            </button>
                        </div>
                    )}

                    {trade && trade.status === 'fiat_sent' && isSeller && (
                        <div className="card-glass border-orange p-3 animate-in">
                            <h4 className="mb-1 text-sm font-bold uppercase tracking-wider text-orange">📢 Payment Reported</h4>
                            <p className="text-xs text-muted mb-3">The buyer has submitted a UTR. Follow these steps to verify:</p>

                            <div className="verification-steps mb-4">
                                <div className="v-step">
                                    <span className="v-num">1</span>
                                    <span className="v-text">Open your bank/UPI app.</span>
                                </div>
                                <div className="v-step">
                                    <span className="v-num">2</span>
                                    <span className="v-text">Check for <b>₹{trade.fiat_amount}</b> from the buyer.</span>
                                </div>
                                <div className="v-step">
                                    <span className="v-num">3</span>
                                    <span className="v-text">Match the UTR: <b>{trade.payment_proofs?.[0]?.utr || 'Pending'}</b></span>
                                </div>
                            </div>

                            <button
                                className="btn btn-success btn-block btn-lg mb-2"
                                onClick={confirmReceipt}
                                disabled={actionLoading}
                            >
                                {actionLoading ? <span className="spinner" /> : '✅ Confirm & Release Crypto'}
                            </button>
                        </div>
                    )}

                    {trade && trade.status === 'fiat_sent' && !isSeller && (
                        <div className="text-center p-4">
                            <div className="loading-dots mb-2">Waiting for seller to release...</div>
                            <p className="text-xs text-muted">The seller is verifying your UTR.</p>
                        </div>
                    )}

                    {/* DISPUTE & REFUND SECTION */}
                    {trade && ['fiat_sent', 'in_escrow'].includes(trade.status) && (
                        <div className="mt-4 animate-in">
                            <button
                                className={`btn btn-danger btn-block ${disputeTimer > 0 && trade.status === 'fiat_sent' ? 'opacity-50' : ''}`}
                                onClick={() => {
                                    if (disputeTimer > 0 && trade.status === 'fiat_sent') {
                                        const minutes = Math.floor(disputeTimer / 60000);
                                        const seconds = (Math.floor(disputeTimer / 1000) % 60).toString().padStart(2, '0');
                                        alert(`The dispute button is meditating 🧘‍♂️\n\nAppeal available in ${minutes}:${seconds}`);
                                        return;
                                    }
                                    raiseDispute();
                                }}
                                disabled={actionLoading}
                            >
                                ⚠️ Raise Dispute
                            </button>
                            {disputeTimer > 0 && trade.status === 'fiat_sent' && (
                                <p className="text-[10px] text-muted text-center mt-2">
                                    Appeal available in {Math.floor(disputeTimer / 60000)}:{(Math.floor(disputeTimer / 1000) % 60).toString().padStart(2, '0')}
                                </p>
                            )}
                        </div>
                    )}

                    {trade && trade.status === 'completed' && (
                        <div className="td-completed text-center animate-in">
                            <span className="td-check">🎉</span>
                            <h3 className="text-green">Trade Completed!</h3>
                            <p className="text-sm text-muted mt-1">Funds have been released successfully</p>
                        </div>
                    )}

                </div>

                {trade && (
                    <div className="td-chat">
                        <div className="chat-header">
                            <h4>💬 Trade Chat</h4>
                            <span className="chat-badge">Active</span>
                        </div>
                        <div className="chat-messages">
                            {messages.length === 0 && (
                                <p className="chat-empty">No messages yet. Start the conversation!</p>
                            )}
                            {messages.map(m => {
                                const isSystemMsg = m.type === 'system';
                                const isAdminMsg = !isSystemMsg && user?.admin_ids?.includes(m.telegram_id);
                                const isMine = m.user_id === user.id;
                                const msgClass = isSystemMsg ? 'msg-system' : isAdminMsg ? 'msg-admin' : isMine ? 'msg-me' : 'msg-them';

                                return (
                                    <div key={m.id} className={`chat-msg ${msgClass}`}>
                                        {/* System message — centered */}
                                        {isSystemMsg ? (
                                            <div className="msg-bubble msg-system-bubble">
                                                <div className="msg-text">{m.message}</div>
                                                <div className="msg-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Them/Admin Avatar (left side) */}
                                                {!isMine && (
                                                    <div className="chat-avatar">
                                                        {m.photo_url ? (
                                                            <img src={m.photo_url} alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
                                                        ) : (
                                                            <div className="w-full h-full rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-white font-bold">
                                                                {isAdminMsg ? '🛡️' : ((m.username || m.first_name || '?')[0].toUpperCase())}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="msg-bubble">
                                                    <div className="msg-sender">
                                                        {isAdminMsg ? `🛡️ ${m.username || 'Admin'}` : (m.username || m.first_name || 'User')}
                                                    </div>
                                                    {/* Image message */}
                                                    {m.type === 'image' && m.image_url && (
                                                        <div className="msg-image" onClick={() => setFullscreenImage(m.image_url)}>
                                                            <img src={m.image_url} alt="Payment proof" />
                                                            <div className="msg-image-label">📸 Tap to view</div>
                                                        </div>
                                                    )}
                                                    {/* Text message */}
                                                    {m.message && <div className="msg-text">{m.message}</div>}
                                                    <div className="msg-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </div>

                                                {/* Me Avatar (right side) */}
                                                {isMine && (
                                                    <div className="chat-avatar">
                                                        {user.photo_url ? (
                                                            <img src={user.photo_url} alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
                                                        ) : (
                                                            <div className="w-full h-full rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-white font-bold">
                                                                {user.first_name?.[0]?.toUpperCase() || '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Image Preview */}
                        {imagePreview && (
                            <div className="chat-preview">
                                <img src={imagePreview} alt="Preview" className="chat-preview-img" />
                                <button className="chat-preview-close" onClick={clearSelectedImage}>✕</button>
                            </div>
                        )}

                        {/* Chat Input */}
                        <div className="chat-input">
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*"
                                onChange={handleImageSelect}
                                style={{ display: 'none' }}
                            />
                            <button className="chat-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach photo">
                                📎
                            </button>
                            <input
                                placeholder={selectedImage ? 'Add caption...' : 'Type a message...'}
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                className="chat-text-input"
                            />
                            <button
                                className="chat-send-btn"
                                onClick={handleSendMessage}
                                disabled={sendingMessage || uploadingImage || (!newMessage.trim() && !selectedImage)}
                            >
                                {uploadingImage ? '⏳' : selectedImage ? '📤' : '➤'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Fullscreen Image Viewer */}
                {fullscreenImage && (
                    <div className="chat-fullscreen" onClick={() => setFullscreenImage(null)}>
                        <img src={fullscreenImage} alt="Full size" />
                        <button className="chat-fullscreen-close">✕ Close</button>
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && !showLockUI && <div className="co-error mt-3">{error}</div>}

            {/* Trader Profile Modal */}
            {showProfileId && (
                <TraderProfile
                    userId={showProfileId}
                    onClose={() => setShowProfileId(null)}
                />
            )}
        </div>
    );
}
