import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { IconTokenETH, IconTokenUSDC, IconTokenUSDT, IconSend, IconRefresh, IconLock, IconCopy, IconQr } from '../components/Icons';
import { useAccount, useWriteContract, useConfig, useReadContract, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { appKit } from '../lib/wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { ESCROW_ABI, ERC20_ABI, CONTRACTS } from '../lib/contracts';
import { bsc, base } from 'wagmi/chains';
import { copyToClipboard } from '../lib/utils';
import './Wallet.css';

interface Props {
    user: any;
}

export function Wallet({ user }: Props) {
    const [balances, setBalances] = useState<any>(null);
    // const [loading, setLoading] = useState(true);

    // Actions
    const [showSend, setShowSend] = useState(false);
    const [showReceive, setShowReceive] = useState(false);

    // Send State
    const [sendTo, setSendTo] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const [sendToken, setSendToken] = useState('USDC');
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState('');
    const [sendChain, setSendChain] = useState<'base' | 'bsc'>('base');

    // Vault State
    const [vaultBaseUsdc, setVaultBaseUsdc] = useState('0.00');
    const [vaultBscUsdc, setVaultBscUsdc] = useState('0.00');
    const [vaultBaseUsdt, setVaultBaseUsdt] = useState('0.00');
    const [vaultBscUsdt, setVaultBscUsdt] = useState('0.00');

    // Reserved State
    const [reservedBaseUsdc, setReservedBaseUsdc] = useState('0.00');
    const [reservedBscUsdc, setReservedBscUsdc] = useState('0.00');
    const [reservedBaseUsdt, setReservedBaseUsdt] = useState('0.00');
    const [reservedBscUsdt, setReservedBscUsdt] = useState('0.00');
    const [vaultBscBnb, setVaultBscBnb] = useState('0.00');
    const [reservedBscBnb, setReservedBscBnb] = useState('0.00');

    // Vault Action State
    const [showVaultAction, setShowVaultAction] = useState<'deposit' | 'withdraw' | null>(null);
    const [vaultAmount, setVaultAmount] = useState('');
    const [vaultChain, setVaultChain] = useState<'base' | 'bsc'>('base');
    const [vaultToken, setVaultToken] = useState<'USDC' | 'USDT' | 'BNB'>('USDC');
    const [vaultLoading, setVaultLoading] = useState(false);
    const [vaultError, setVaultError] = useState('');
    const [vaultSuccess, setVaultSuccess] = useState('');
    const [vaultStep, setVaultStep] = useState<'idle' | 'approved'>('idle');

    const { address: wagmiAddress, isConnected, chain: walletChain } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const { switchChainAsync } = useSwitchChain();
    const config = useConfig();

    useEffect(() => {
        loadBalances();
    }, []);

    const formatBal = (val: any, decs = 2) => {
        const num = parseFloat(val || '0');
        if (num > 0 && num < 0.0001) return '0.0000';
        if (num === 0) return '0.00';
        return num.toFixed(decs);
    };

    async function loadBalances() {
        // setLoading(true);
        try {
            const data = await api.wallet.getBalances();
            setBalances(data);
            setVaultBaseUsdc(data.vault_base_usdc || '0.00');
            setVaultBscUsdc(data.vault_bsc_usdc || '0.00');
            setVaultBaseUsdt(data.vault_base_usdt || '0.00');
            setVaultBscUsdt(data.vault_bsc_usdt || '0.00');
            setVaultBscBnb(data.vault_bsc_bnb || '0.00');

            setReservedBaseUsdc(data.reserved_base_usdc || '0.00');
            setReservedBscUsdc(data.reserved_bsc_usdc || '0.00');
            setReservedBaseUsdt(data.reserved_base_usdt || '0.00');
            setReservedBscUsdt(data.reserved_bsc_usdt || '0.00');
            setReservedBscBnb(data.reserved_bsc_bnb || '0.00');
        } catch { } finally {
            // setLoading(false);
        }
    }

    async function copyAddress() {
        if (!balances?.address) return;
        const success = await copyToClipboard(balances.address);
        if (success) {
            haptic('success');
        }
    }

    // ═══ SEND ═══
    async function handleSend() {
        if (!sendTo || !sendAmount) return;
        if (parseFloat(sendAmount) <= 0) {
            setSendResult('error:Invalid amount');
            return;
        }
        haptic('medium');
        setSending(true);
        setSendResult('');
        try {
            const { txHash } = await api.wallet.send({
                to: sendTo,
                amount: parseFloat(sendAmount),
                token: sendToken,
                chain: sendChain
            });
            setSendResult(`sent:${txHash}`);
            haptic('success');
            await loadBalances();
            setSendTo('');
            setSendAmount('');
            setTimeout(() => setShowSend(false), 2000);
        } catch (err: any) {
            setSendResult(`error:${err.message}`);
            haptic('error');
        } finally {
            setSending(false);
        }
    }

    // ═══ VAULT: Allowance check for external wallets ═══
    const vaultContracts = (CONTRACTS as any)[vaultChain];
    const vaultTokenAddress = vaultContracts?.tokens?.[vaultToken] as `0x${string}` | undefined;
    const vaultEscrowAddress = (vaultChain === 'bsc' ? "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a" : vaultContracts?.escrow) as `0x${string}` | undefined;
    const vaultDecimals = (vaultChain === 'bsc') ? 18 : 6;
    const isNativeVault = vaultToken === 'BNB';

    const { data: vaultAllowance, refetch: refetchVaultAllowance } = useReadContract({
        address: vaultTokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: wagmiAddress && vaultEscrowAddress ? [wagmiAddress, vaultEscrowAddress] : undefined,
        chainId: vaultChain === 'bsc' ? bsc.id : base.id,
        query: {
            enabled: !!wagmiAddress && !!vaultTokenAddress && !!vaultEscrowAddress && user?.wallet_type === 'external' && showVaultAction === 'deposit' && !isNativeVault
        }
    });

    const vaultNeedsApproval = !isNativeVault && showVaultAction === 'deposit' && user?.wallet_type === 'external' && vaultAmount && parseFloat(vaultAmount) > 0 && (
        vaultAllowance === undefined || parseFloat(formatUnits(vaultAllowance as bigint, vaultDecimals)) < parseFloat(vaultAmount)
    );

    // ═══ VAULT OPERATIONS ═══
    async function handleVaultApprove() {
        if (!vaultAmount || parseFloat(vaultAmount) <= 0) return;
        setVaultLoading(true);
        setVaultError('');
        setVaultSuccess('');

        try {
            const targetChainId = vaultChain === 'bsc' ? bsc.id : base.id;
            if (walletChain?.id !== targetChainId) {
                setVaultError(`Please switch to ${vaultChain.toUpperCase()} network`);
                try {
                    await switchChainAsync({ chainId: targetChainId });
                    setVaultError('');
                } catch (e) {
                    appKit.open({ view: 'Networks' });
                }
                setVaultLoading(false);
                return;
            }

            const parsedAmount = parseUnits(vaultAmount, vaultDecimals);
            const isBsc = vaultChain === 'bsc';
            const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

            const approveHash = await writeContractAsync({
                address: vaultTokenAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [vaultEscrowAddress as `0x${string}`, parsedAmount],
                gasPrice,
                gas: isBsc ? 100000n : undefined
            });
            await waitForTransactionReceipt(config, { hash: approveHash });

            haptic('success');
            setVaultSuccess('✅ Approved! Now click Deposit.');
            setVaultStep('approved');
            await refetchVaultAllowance();
        } catch (err: any) {
            console.error(err);
            setVaultError(err.message || 'Approval failed');
            haptic('error');
        } finally {
            setVaultLoading(false);
        }
    }

    async function handleVaultAction() {
        if (!vaultAmount || parseFloat(vaultAmount) <= 0) return;

        // Validation for Withdraw
        if (showVaultAction === 'withdraw') {
            let available = 0;
            if (vaultChain === 'base') {
                available = vaultToken === 'USDC'
                    ? parseFloat(vaultBaseUsdc) - parseFloat(reservedBaseUsdc)
                    : parseFloat(vaultBaseUsdt) - parseFloat(reservedBaseUsdt);
            } else {
                available = vaultToken === 'USDC'
                    ? parseFloat(vaultBscUsdc) - parseFloat(reservedBscUsdc)
                    : vaultToken === 'USDT'
                        ? parseFloat(vaultBscUsdt) - parseFloat(reservedBscUsdt)
                        : parseFloat(vaultBscBnb) - parseFloat(reservedBscBnb);
            }

            if (parseFloat(vaultAmount) > available) {
                setVaultError(`Insufficient Available Balance! Max withdrawable: ${available.toFixed(2)} ${vaultToken}`);
                haptic('error');
                return;
            }
        }

        setVaultLoading(true);
        setVaultError('');
        setVaultSuccess('');

        try {
            const amount = parseFloat(vaultAmount);
            const isExternal = user?.wallet_type === 'external';
            const targetChainId = vaultChain === 'bsc' ? bsc.id : base.id;

            if (isExternal) {
                if (!isConnected || !wagmiAddress) {
                    setVaultError("Please connect your wallet first.");
                    return;
                }

                if (walletChain?.id !== targetChainId) {
                    setVaultError(`Please switch to ${vaultChain.toUpperCase()} network`);
                    try {
                        await switchChainAsync({ chainId: targetChainId });
                        setVaultError('');
                    } catch (e) {
                        appKit.open({ view: 'Networks' });
                    }
                    setVaultLoading(false);
                    return;
                }

                const parsedAmount = parseUnits(vaultAmount, vaultDecimals);
                const isBsc = vaultChain === 'bsc';
                const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

                if (showVaultAction === 'deposit') {
                    setVaultSuccess('Deposit pending...');
                    const depositHash = await writeContractAsync({
                        address: vaultEscrowAddress as `0x${string}`,
                        abi: ESCROW_ABI,
                        functionName: 'deposit',
                        args: [vaultTokenAddress as `0x${string}`, parsedAmount],
                        gasPrice,
                        gas: isBsc ? 500000n : undefined,
                        value: isNativeVault ? parsedAmount : undefined
                    });
                    await waitForTransactionReceipt(config, { hash: depositHash });
                } else {
                    setVaultSuccess('Withdraw pending...');
                    const txHash = await writeContractAsync({
                        address: vaultEscrowAddress as `0x${string}`,
                        abi: ESCROW_ABI,
                        functionName: 'withdraw',
                        args: [vaultTokenAddress as `0x${string}`, parsedAmount],
                        gasPrice: isBsc ? parseUnits('0.1', 9) : undefined,
                        gas: isBsc ? 500000n : undefined
                    });
                    await waitForTransactionReceipt(config, { hash: txHash });
                }
                setVaultSuccess('Success!');
            } else {
                // Bot Wallet
                if (showVaultAction === 'deposit') {
                    await api.wallet.depositToVault(amount, vaultToken, vaultChain);
                } else {
                    await api.wallet.withdrawFromVault(amount, vaultToken, vaultChain);
                }
                setVaultSuccess('Success!');
            }

            haptic('success');
            setVaultAmount('');
            setVaultStep('idle');
            setTimeout(() => {
                setShowVaultAction(null);
                loadBalances();
            }, 1500);
        } catch (err: any) {
            console.error(err);
            setVaultError(err.message || 'Operation failed');
            haptic('error');
        } finally {
            setVaultLoading(false);
        }
    }

    // ═══ RENDER HELPERS ═══
    const tokenIcons: Record<string, React.ReactNode> = {
        ETH: <IconTokenETH size={24} />,
        USDC: <IconTokenUSDC size={24} />,
        USDT: <IconTokenUSDT size={24} />,
        BNB: <div style={{ width: 24, height: 24, background: '#F0B90B', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 8, color: 'black' }}>BNB</div>,
    };

    const assets = [
        { symbol: 'ETH', name: 'Ethereum', chain: 'Base', balance: balances?.eth || '0', icon: 'ETH', price: 2500 },
        { symbol: 'USDC', name: 'USD Coin', chain: 'Base', balance: balances?.usdc || '0.00', icon: 'USDC', price: 1 },
        { symbol: 'USDT', name: 'Tether', chain: 'Base', balance: balances?.usdt || '0.00', icon: 'USDT', price: 1 },
        { symbol: 'BNB', name: 'Binance Coin', chain: 'BSC', balance: balances?.bnb || '0', icon: 'BNB', price: 300 },
        { symbol: 'USDC', name: 'USD Coin', chain: 'BSC', balance: balances?.bsc_usdc || '0.00', icon: 'USDC', price: 1 },
        { symbol: 'USDT', name: 'Tether', chain: 'BSC', balance: balances?.bsc_usdt || '0.00', icon: 'USDT', price: 1 },
    ];

    // Calculate Total Balance (Approx)
    let totalValue = 0;
    assets.forEach(a => {
        totalValue += parseFloat(a.balance) * a.price;
    });
    // Add Vault value
    totalValue += (parseFloat(vaultBaseUsdc) + parseFloat(vaultBaseUsdt) + parseFloat(vaultBscUsdc) + parseFloat(vaultBscUsdt) + parseFloat(vaultBscBnb));

    return (
        <div className="page wallet-page animate-in">
            {/* Header / Total Balance */}
            <div className="wallet-header-card">
                <div className="wallet-label">Total Asset Value (Est.)</div>
                <div className="wallet-total">
                    ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    ≈ ₹{(totalValue * 87).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>

                {/* Address + Action */}
                {balances?.address && (
                    <div className="flex justify-between items-end mt-4">
                        <div className="wallet-address-row" onClick={copyAddress}>
                            <IconCopy size={14} color="#94a3b8" />
                            <span className="wallet-addr-text">
                                {balances.address.slice(0, 6)}...{balances.address.slice(-4)}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button className="btn btn-sm btn-secondary" onClick={() => setShowReceive(true)}>
                                <IconQr size={16} /> <span className="ml-1">Deposit</span>
                            </button>
                            <button className="btn btn-sm btn-primary" onClick={() => setShowSend(true)}>
                                <IconSend size={16} /> <span className="ml-1">Send</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* P2P Vault Section */}
            <div className="vault-card">
                <div className="vault-header">
                    <div className="vault-title">
                        <IconLock size={16} color="#6366f1" />
                        P2P Escrow Vault
                    </div>
                    <div className="vault-actions">
                        <button className="btn-vault deposit" onClick={() => { setShowVaultAction('deposit'); setVaultError(''); setVaultSuccess(''); }}>
                            + Top Up
                        </button>
                        <button className="btn-vault withdraw" onClick={() => { setShowVaultAction('withdraw'); setVaultError(''); setVaultSuccess(''); }}>
                            Withdraw
                        </button>
                    </div>
                </div>

                <div className="vault-assets">
                    {/* Base */}
                    <div className="vault-asset-box">
                        <div className="v-asset-row">
                            <span className="v-symbol">USDC</span>
                            <span className="v-chain">Base</span>
                        </div>
                        <div className="v-bal">{parseFloat(vaultBaseUsdc).toFixed(2)}</div>
                        {parseFloat(reservedBaseUsdc) > 0 && <div className="v-reserved">🔒 {reservedBaseUsdc}</div>}
                    </div>
                    <div className="vault-asset-box">
                        <div className="v-asset-row">
                            <span className="v-symbol">USDT</span>
                            <span className="v-chain">Base</span>
                        </div>
                        <div className="v-bal">{parseFloat(vaultBaseUsdt).toFixed(2)}</div>
                        {parseFloat(reservedBaseUsdt) > 0 && <div className="v-reserved">🔒 {reservedBaseUsdt}</div>}
                    </div>
                    {/* BSC */}
                    <div className="vault-asset-box">
                        <div className="v-asset-row">
                            <span className="v-symbol">USDC</span>
                            <span className="v-chain">BSC</span>
                        </div>
                        <div className="v-bal">{parseFloat(vaultBscUsdc).toFixed(2)}</div>
                        {parseFloat(reservedBscUsdc) > 0 && <div className="v-reserved">🔒 {reservedBscUsdc}</div>}
                    </div>
                    <div className="vault-asset-box">
                        <div className="v-asset-row">
                            <span className="v-symbol">USDT</span>
                            <span className="v-chain">BSC</span>
                        </div>
                        <div className="v-bal">{parseFloat(vaultBscUsdt).toFixed(2)}</div>
                        {parseFloat(reservedBscUsdt) > 0 && <div className="v-reserved">🔒 {reservedBscUsdt}</div>}
                    </div>
                    <div className="vault-asset-box">
                        <div className="v-asset-row">
                            <span className="v-symbol">BNB</span>
                            <span className="v-chain">BSC</span>
                        </div>
                        <div className="v-bal">{parseFloat(vaultBscBnb).toFixed(4)}</div>
                        {parseFloat(reservedBscBnb) > 0 && <div className="v-reserved">🔒 {reservedBscBnb}</div>}
                    </div>
                </div>
            </div>

            {/* Asset List */}
            <div className="section-title">
                My Assets
                <span onClick={() => { haptic('light'); loadBalances(); }} style={{ cursor: 'pointer', opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                    <IconRefresh size={16} />
                </span>
            </div>

            <div className="asset-list">
                {assets.map((asset, i) => (
                    <div className="asset-item" key={i}>
                        <div className="asset-left">
                            <div className="asset-icon">{tokenIcons[asset.icon]}</div>
                            <div className="asset-info">
                                <span className="asset-symbol">{asset.symbol}</span>
                                <span className="asset-chain">{asset.chain}</span>
                            </div>
                        </div>
                        <div className="asset-right">
                            <span className="asset-bal">
                                {asset.symbol === 'ETH' || asset.symbol === 'BNB'
                                    ? parseFloat(asset.balance).toFixed(5)
                                    : parseFloat(asset.balance).toFixed(2)}
                            </span>
                            <span className="asset-fiat">
                                ${(parseFloat(asset.balance) * asset.price).toFixed(2)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ═══ MODALS ═══ */}

            {/* Receive Modal */}
            {showReceive && (
                <div className="modal-overlay" onClick={() => setShowReceive(false)}>
                    <div className="modal-content qr-modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Deposit Crypto</h3>
                        <p className="text-sm text-muted mb-2">Scan or copy address to deposit funds</p>

                        <div className="qr-code-box">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${balances?.address}`}
                                alt="QR"
                                width={150} height={150}
                            />
                        </div>

                        <div className="p-2 bg-secondary rounded mb-4 break-all mono text-sm select-all">
                            {balances?.address}
                        </div>

                        <button className="btn btn-primary btn-block" onClick={copyAddress}>
                            Copy Address
                        </button>
                    </div>
                </div>
            )}

            {/* Send Modal */}
            {showSend && (
                <div className="modal-overlay" onClick={() => setShowSend(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Send Crypto</h3>

                        {/* Token Select */}
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                            {['USDC', 'USDT', 'ETH', 'BNB'].map(t => (
                                <button
                                    key={t}
                                    className={`btn btn-sm ${sendToken === t ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => {
                                        setSendToken(t);
                                        // Auto-select chain
                                        if (t === 'BNB') setSendChain('bsc');
                                        else if (t === 'ETH') setSendChain('base');
                                        // defaults for USDC/USDT is base, but user can toggle
                                    }}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        {/* Chain Select (if applicable) */}
                        {(sendToken === 'USDC' || sendToken === 'USDT') && (
                            <div className="flex gap-2 mb-4">
                                <button className={`btn btn-sm ${sendChain === 'base' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSendChain('base')}>Base</button>
                                <button className={`btn btn-sm ${sendChain === 'bsc' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSendChain('bsc')}>BSC</button>
                            </div>
                        )}

                        <input
                            className="input-lg mb-3"
                            placeholder="Recipient Address (0x...)"
                            value={sendTo}
                            onChange={e => setSendTo(e.target.value)}
                        />
                        <input
                            className="input-lg mb-4"
                            type="number"
                            placeholder="Amount"
                            value={sendAmount}
                            onChange={e => setSendAmount(e.target.value)}
                        />

                        {sendResult && (
                            <div className={`mb-3 text-sm ${sendResult.startsWith('sent:') ? 'text-green' : 'text-red'}`}>
                                {sendResult.startsWith('sent:') ? 'Transaction Sent!' : sendResult.replace('error:', '')}
                            </div>
                        )}

                        <button className="btn btn-primary btn-block" onClick={handleSend} disabled={sending}>
                            {sending ? <span className="spinner" /> : 'Confirm Send'}
                        </button>
                    </div>
                </div>
            )}

            {/* Vault Action Modal */}
            {showVaultAction && (
                <div className="modal-overlay" onClick={() => setShowVaultAction(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>{showVaultAction === 'deposit' ? 'Top Up Vault' : 'Withdraw from Vault'}</h3>

                        <div className="flex gap-2 mb-4 mt-2">
                            <div className="flex-1">
                                <label className="text-xs text-muted mb-1 block">Chain</label>
                                <div className="flex gap-1">
                                    <button className={`btn btn-sm flex-1 ${vaultChain === 'base' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setVaultChain('base'); if (vaultToken === 'BNB') setVaultToken('USDC'); }}>Base</button>
                                    <button className={`btn btn-sm flex-1 ${vaultChain === 'bsc' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setVaultChain('bsc')}>BSC</button>
                                </div>
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-muted mb-1 block">Token</label>
                                <div className="flex gap-1">
                                    {['USDC', 'USDT', ...(vaultChain === 'bsc' ? ['BNB'] : [])].map(t => (
                                        <button
                                            key={t}
                                            className={`btn btn-sm flex-1 ${vaultToken === t ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setVaultToken(t as any)}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="card bg-secondary p-3 mb-4">
                            <div className="flex justify-between text-xs text-muted mb-1">
                                <span>{showVaultAction === 'deposit' ? 'Wallet Balance' : 'Available in Vault'}</span>
                            </div>
                            <div className="font-mono font-bold text-lg">
                                {/* Display correct available balance hint */}
                                {showVaultAction === 'deposit' ? (
                                    // Wallet Balance
                                    formatBal(vaultChain === 'base'
                                        ? (vaultToken === 'USDC' ? balances?.usdc : balances?.usdt)
                                        : (vaultToken === 'USDC' ? balances?.bsc_usdc : vaultToken === 'USDT' ? balances?.bsc_usdt : balances?.bnb),
                                        vaultToken === 'BNB' ? 4 : 2
                                    )
                                ) : (
                                    // Vault Available
                                    formatBal(vaultChain === 'base'
                                        ? (vaultToken === 'USDC' ? (parseFloat(vaultBaseUsdc) - parseFloat(reservedBaseUsdc)).toString() : (parseFloat(vaultBaseUsdt) - parseFloat(reservedBaseUsdt)).toString())
                                        : (vaultToken === 'USDC'
                                            ? (parseFloat(vaultBscUsdc) - parseFloat(reservedBscUsdc)).toString()
                                            : vaultToken === 'USDT'
                                                ? (parseFloat(vaultBscUsdt) - parseFloat(reservedBscUsdt)).toString()
                                                : (parseFloat(vaultBscBnb) - parseFloat(reservedBscBnb)).toString()
                                        ),
                                        vaultToken === 'BNB' ? 4 : 2
                                    )
                                )}
                            </div>
                        </div>

                        <input
                            type="number"
                            placeholder="Amount"
                            className="input-lg mb-4"
                            value={vaultAmount}
                            onChange={e => setVaultAmount(e.target.value)}
                            autoFocus
                        />

                        {vaultError && <div className="text-red text-sm mb-3">{vaultError}</div>}
                        {vaultSuccess && <div className="text-green text-sm mb-3">{vaultSuccess}</div>}

                        {user?.wallet_type === 'external' && walletChain?.id !== (vaultChain === 'bsc' ? bsc.id : base.id) ? (
                            <button
                                className="btn btn-primary btn-block"
                                onClick={async () => {
                                    setVaultLoading(true);
                                    try {
                                        await switchChainAsync({ chainId: vaultChain === 'bsc' ? bsc.id : base.id });
                                        setVaultError('');
                                    } catch (e) {
                                        appKit.open({ view: 'Networks' });
                                    }
                                    setVaultLoading(false);
                                }}
                                disabled={vaultLoading}
                            >
                                {vaultLoading ? <span className="spinner" /> : `Switch to ${vaultChain.toUpperCase()} Network`}
                            </button>
                        ) : showVaultAction === 'deposit' && user?.wallet_type === 'external' && vaultNeedsApproval && vaultStep !== 'approved' ? (
                            <button
                                className="btn btn-primary btn-block"
                                onClick={handleVaultApprove}
                                disabled={vaultLoading || !vaultAmount || parseFloat(vaultAmount) <= 0}
                            >
                                {vaultLoading ? <span className="spinner" /> : `Step 1: Approve ${vaultToken}`}
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary btn-block"
                                onClick={handleVaultAction}
                                disabled={vaultLoading || !vaultAmount || parseFloat(vaultAmount) <= 0}
                            >
                                {vaultLoading ? <span className="spinner" /> : (showVaultAction === 'deposit' ? (user?.wallet_type === 'external' ? 'Step 2: Deposit' : 'Deposit') : 'Withdraw')}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
