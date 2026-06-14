import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import {
    IconArrowUp,
    IconArrowDown,
    IconSwap,
    IconCopy,
    IconCheck,
    IconWarning,
    IconInfo,
    IconLock,
    IconReceive,
    IconX,
    IconChainEth,
    IconChainBase,
    IconChainPolygon,
    IconChainArbitrum,
    IconChainOptimism,
    IconTokenETH,
    IconTokenUSDC,
    IconTokenUSDT,
    IconTokenBNB,
    IconChainBsc,
    IconSend,
    IconRefresh,
    IconQr,
    IconChevronRight,
    IconFilter,
    IconArrowLeft,
    IconWallet
} from '../components/Icons';
import { useAccount, useWriteContract, useConfig, useReadContract, useSwitchChain, useChainId, useBalance } from 'wagmi';
import { parseUnits, formatUnits, maxUint256 } from 'viem';
import { appKit } from '../lib/wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { ESCROW_ABI, ERC20_ABI, CONTRACTS } from '../lib/contracts';
import { bsc, base } from 'wagmi/chains';
import { copyToClipboard, formatError } from '../lib/utils';
import { useToast } from '../components/Toast';
import './Wallet.css';

interface Props {
    user: any;
}

export function Wallet({ user }: Props) {
    const [balances, setBalances] = useState<any>(null);

    // Overlays
    const [showSend, setShowSend] = useState(false);
    const [showAssetSelector, setShowAssetSelector] = useState(false);
    const [selectorSearch, setSelectorSearch] = useState('');
    const [showReceive, setShowReceive] = useState(false);
    const [showSearchOverlay, setShowSearchOverlay] = useState(false);
    
    // Manage Funds State
    const [vaultBaseUsdc, setVaultBaseUsdc] = useState('0.00');
    const [vaultBscUsdc, setVaultBscUsdc] = useState('0.00');
    const [vaultBaseUsdt, setVaultBaseUsdt] = useState('0.00');
    const [vaultBscUsdt, setVaultBscUsdt] = useState('0.00');
    const [vaultBscBnb, setVaultBscBnb] = useState('0.0000');

    // Reserved State
    const [reservedBaseUsdc, setReservedBaseUsdc] = useState('0.00');
    const [reservedBscUsdc, setReservedBscUsdc] = useState('0.00');
    const [reservedBaseUsdt, setReservedBaseUsdt] = useState('0.00');
    const [reservedBscUsdt, setReservedBscUsdt] = useState('0.00');
    const [reservedBscBnb, setReservedBscBnb] = useState('0.0000');

    // Coming Soon overlay
    const [showComingSoon, setShowComingSoon] = useState(false);
    const triggerComingSoon = () => {
        haptic('medium');
        setShowComingSoon(true);
        setTimeout(() => setShowComingSoon(false), 2800);
    };

    // Send State
    const [sendTo, setSendTo] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const [sendToken, setSendToken] = useState('ETH');
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState('');
    const [sendChain, setSendChain] = useState<'base' | 'bsc' | 'arbitrum' | 'optimism' | 'polygon'>('base');

    // Vault Action State
    const [showVaultAction, setShowVaultAction] = useState<'deposit' | 'withdraw' | null>(null);
    const [vaultAmount, setVaultAmount] = useState('');
    const [vaultChain, setVaultChain] = useState<'base' | 'bsc'>('base');
    const [vaultToken, setVaultToken] = useState<'USDC' | 'USDT' | 'BNB'>('USDT');
    const [vaultLoading, setVaultLoading] = useState(false);
    const [vaultError, setVaultError] = useState('');
    const [vaultSuccess, setVaultSuccess] = useState('');
    const [vaultStep, setVaultStep] = useState<'idle' | 'approved'>('idle');
    const [showVaultInfo, setShowVaultInfo] = useState(false);

    // Accordion for Ethereum Nested View
    const [ethExpanded, setEthExpanded] = useState(false);

    // Search and filters
    const [chainFilter, setChainFilter] = useState('All');

    // Saved Contacts
    interface SavedContact { name: string; address: string; }
    const [savedContacts, setSavedContacts] = useState<SavedContact[]>(() => {
        try { return JSON.parse(localStorage.getItem('wallet_contacts') || '[]'); } catch { return []; }
    });
    const [showAddContact, setShowAddContact] = useState(false);
    const [newContactName, setNewContactName] = useState('');
    const [newContactAddress, setNewContactAddress] = useState('');
    const [selectedContact, setSelectedContact] = useState<SavedContact | null>(null);

    const saveContact = () => {
        if (!newContactName.trim() || !newContactAddress.trim()) return;
        const updated = [...savedContacts, { name: newContactName.trim(), address: newContactAddress.trim() }];
        setSavedContacts(updated);
        localStorage.setItem('wallet_contacts', JSON.stringify(updated));
        setNewContactName('');
        setNewContactAddress('');
        setShowAddContact(false);
    };
    const removeContact = (idx: number) => {
        const updated = savedContacts.filter((_, i) => i !== idx);
        setSavedContacts(updated);
        localStorage.setItem('wallet_contacts', JSON.stringify(updated));
        if (selectedContact === savedContacts[idx]) setSelectedContact(null);
    };

    const { address: wagmiAddress, isConnected } = useAccount();
    const currentChainId = useChainId();
    const { writeContractAsync } = useWriteContract();
    const { switchChainAsync } = useSwitchChain();
    const { showToast } = useToast();
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
        try {
            const data = await api.wallet.getBalances();
            setBalances(data);
            setVaultBaseUsdc(data.vault_base_usdc || '0.00');
            setVaultBscUsdc(data.vault_bsc_usdc || '0.00');
            setVaultBaseUsdt(data.vault_base_usdt || '0.00');
            setVaultBscUsdt(data.vault_bsc_usdt || '0.00');
            setVaultBscBnb(data.vault_bsc_bnb || '0.0000');

            setReservedBaseUsdc(data.reserved_base_usdc || '0.00');
            setReservedBscUsdc(data.reserved_bsc_usdc || '0.00');
            setReservedBaseUsdt(data.reserved_base_usdt || '0.00');
            setReservedBscUsdt(data.reserved_bsc_usdt || '0.00');
            setReservedBscBnb(data.reserved_bsc_bnb || '0.0000');
        } catch { }
    }

    async function copyAddress() {
        const addr = balances?.address || user?.wallet_address || wagmiAddress;
        if (!addr) return;
        const success = await copyToClipboard(addr);
        if (success) {
            haptic('success');
            showToast("Address copied!", "success");
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
                chain: sendChain === 'base' || sendChain === 'bsc' ? sendChain : 'base'
            });
            setSendResult(`sent:${txHash}`);
            haptic('success');
            showToast("Transaction sent successfully!", "success");
            await loadBalances();
            setSendTo('');
            setSendAmount('');
            setTimeout(() => setShowSend(false), 2000);
        } catch (err: any) {
            const cleanMsg = formatError(err);
            setSendResult(`error:${cleanMsg}`);
            showToast(cleanMsg, "error");
            haptic('error');
        } finally {
            setSending(false);
        }
    }

    // ═══ VAULT: Allowance check for external wallets ═══
    const vaultContracts = (CONTRACTS as any)[vaultChain];
    const vaultTokenAddress = vaultContracts?.tokens?.[vaultToken] as `0x${string}` | undefined;
    const vaultEscrowAddress = (vaultChain === 'bsc' ? "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a" : vaultContracts?.escrow) as `0x${string}` | undefined;
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

    // ═══ EXTERNAL WALLET AUTO-FETCH ═══
    const isExt = user?.wallet_type === 'external' && isConnected && wagmiAddress;
    const baseUsdcAddr = (CONTRACTS as any).base.tokens.USDC;
    const baseUsdtAddr = (CONTRACTS as any).base.tokens.USDT;
    const bscUsdcAddr = (CONTRACTS as any).bsc.tokens.USDC;
    const bscUsdtAddr = (CONTRACTS as any).bsc.tokens.USDT;

    const { data: extBscUsdc } = useReadContract({ address: bscUsdcAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: wagmiAddress ? [wagmiAddress] : undefined, chainId: bsc.id, query: { enabled: !!isExt && !!bscUsdcAddr, refetchInterval: 5000 } });
    const { data: extBscUsdt } = useReadContract({ address: bscUsdtAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: wagmiAddress ? [wagmiAddress] : undefined, chainId: bsc.id, query: { enabled: !!isExt && !!bscUsdtAddr, refetchInterval: 5000 } });
    const { data: bscNativeBal } = useBalance({ address: wagmiAddress, chainId: bsc.id, query: { enabled: !!isExt, refetchInterval: 5000 } });

    const { data: extBaseUsdc } = useReadContract({ address: baseUsdcAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: wagmiAddress ? [wagmiAddress] : undefined, chainId: base.id, query: { enabled: !!isExt && !!baseUsdcAddr, refetchInterval: 5000 } });
    const { data: extBaseUsdt } = useReadContract({ address: baseUsdtAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: wagmiAddress ? [wagmiAddress] : undefined, chainId: base.id, query: { enabled: !!isExt && !!baseUsdtAddr, refetchInterval: 5000 } });

    const getExtBalance = (token: string, chain: string) => {
        if (!isExt) return "0.00";
        if (chain === 'base') {
            const raw = token === 'USDC' ? extBaseUsdc : extBaseUsdt;
            return raw ? formatUnits(raw as bigint, 6) : "0.00";
        } else {
            if (token === 'BNB') return bscNativeBal?.value ? formatUnits(bscNativeBal.value, 18) : "0.00";
            const raw = token === 'USDC' ? extBscUsdc : extBscUsdt;
            return raw ? formatUnits(raw as bigint, 18) : "0.00";
        }
    };

    // ═══ SMART NETWORK SWITCHER ═══
    async function smartSwitch(targetId: number) {
        if (currentChainId === targetId) return true;
        haptic('selection');
        setVaultLoading(true);
        showToast(`Switching to ${targetId === bsc.id ? 'BSC' : 'Base'}...`, 'info');

        try {
            const switchPromise = switchChainAsync({ chainId: targetId });
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("SWITCH_TIMEOUT")), 8000)
            );

            await Promise.race([switchPromise, timeoutPromise]);
            await new Promise(r => setTimeout(r, 1000));
            showToast("Network Switched!", "success");
            setVaultLoading(false);
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
            setVaultLoading(false);
            return false;
        }
    }

    // ═══ VAULT OPERATIONS ═══
    async function handleVaultApprove() {
        if (!vaultAmount || parseFloat(vaultAmount) <= 0) return;
        if (user?.wallet_type === 'external' && (!isConnected || !wagmiAddress)) {
            setVaultError("Wallet disconnected. Please connect first.");
            appKit.open();
            return;
        }
        setVaultLoading(true);
        setVaultError('');
        setVaultSuccess('');

        try {
            const targetChainId = vaultChain === 'bsc' ? bsc.id : base.id;
            const switched = await smartSwitch(targetChainId);
            if (!switched) return;

            const isBsc = vaultChain === 'bsc';
            const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

            showToast(`Approving ${vaultToken} in wallet...`, 'info');
            const approveHash = await writeContractAsync({
                address: vaultTokenAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [vaultEscrowAddress as `0x${string}`, maxUint256],
                gasPrice,
                gas: isBsc ? 100000n : undefined
            });
            await waitForTransactionReceipt(config, { hash: approveHash });

            haptic('success');
            setVaultSuccess('✅ Approved! Now click Deposit.');
            showToast("Approved successfully!", "success");
            setVaultStep('approved');
            await refetchVaultAllowance();
        } catch (err: any) {
            console.error(err);
            const cleanMsg = formatError(err);
            setVaultError(cleanMsg);
            showToast(cleanMsg, "error");
            haptic('error');
        } finally {
            setVaultLoading(false);
        }
    }

    async function handleVaultAction() {
        if (!vaultAmount || parseFloat(vaultAmount) <= 0) return;
        if (user?.wallet_type === 'external' && (!isConnected || !wagmiAddress)) {
            setVaultError("Wallet disconnected. Please connect first.");
            appKit.open();
            return;
        }

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
                const switched = await smartSwitch(targetChainId);
                if (!switched) return;

                const parsedAmount = parseUnits(vaultAmount, vaultDecimals);
                const isBsc = vaultChain === 'bsc';
                const gasPrice = isBsc ? parseUnits('0.1', 9) : undefined;

                if (showVaultAction === 'deposit') {
                    setVaultSuccess('Deposit pending...');
                    showToast("Depositing in wallet...", "info");
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
                    showToast("Withdrawing in wallet...", "info");
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
                showToast("Transaction confirmed!", "success");
            } else {
                if (showVaultAction === 'deposit') {
                    await api.wallet.depositToVault(amount, vaultToken, vaultChain);
                } else {
                    await api.wallet.withdrawFromVault(amount, vaultToken, vaultChain);
                }
                setVaultSuccess('Success!');
                showToast("Vault updated!", "success");
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
            const cleanMsg = formatError(err);
            setVaultError(cleanMsg);
            showToast(cleanMsg, "error");
            haptic('error');
        } finally {
            setVaultLoading(false);
        }
    }

    // Verified Blue Badge Icon
    function VerifiedBadge() {
        return (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: 3, verticalAlign: 'middle' }}>
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 16.5L6 12.5L7.41 11.09L10 13.67L16.59 7.08L18 8.5L10 16.5Z" fill="#0052FF" />
            </svg>
        );
    }

    // ═══ RENDER HELPERS ═══
    // Increased size to 32px
    const tokenIcons: Record<string, React.ReactNode> = {
        ETH: <IconTokenETH size={32} />,
        USDC: <IconTokenUSDC size={32} />,
        USDT: <IconTokenUSDT size={32} />,
        BNB: <IconTokenBNB size={32} />,
        HYPE: <IconChainBase size={32} />, 
        GEOD: <IconChainPolygon size={32} />,
        WRON: <IconChainEth size={32} />,
        USDF0: <IconTokenUSDT size={32} />,
        ezETH: <IconTokenETH size={32} />,
        POL: <IconChainPolygon size={32} />,
    };

    const chainBadgeIcons: Record<string, React.ReactNode> = {
        Ethereum: <IconChainEth size={12} />,
        Base: <IconChainBase size={12} />,
        Polygon: <IconChainPolygon size={12} />,
        Arbitrum: <IconChainArbitrum size={12} />,
        Optimism: <IconChainOptimism size={12} />,
        BSC: <IconChainBsc size={12} />,
    };

    // ── Chain name → sendChain key mapping (used for balance lookup + send) ──
    const chainMap2: Record<string, 'base' | 'bsc' | 'polygon'> = { Base: 'base', BSC: 'bsc', Polygon: 'polygon' };

    // ── Live token list built from API balances ──
    // Approximate prices (good enough for display — no price API needed)
    const PRICES: Record<string, number> = {
        ETH: 2500, USDC: 1, USDT: 1, BNB: 600, POL: 0.075
    };

    const liveAssets = [
        { symbol: 'USDC', name: 'USD Coin',      chain: 'Base', balance: balances?.usdc     || '0', price: PRICES.USDC, change: '0%',    verified: true },
        { symbol: 'USDC', name: 'USD Coin',      chain: 'BSC',  balance: balances?.bsc_usdc || '0', price: PRICES.USDC, change: '0%',    verified: true },
        { symbol: 'USDT', name: 'Tether USD',    chain: 'Base', balance: balances?.usdt     || '0', price: PRICES.USDT, change: '0%',    verified: true },
        { symbol: 'USDT', name: 'Tether USD',    chain: 'BSC',  balance: balances?.bsc_usdt || '0', price: PRICES.USDT, change: '0%',    verified: true },
        { symbol: 'ETH',  name: 'Ethereum',      chain: 'Base', balance: balances?.eth      || '0', price: PRICES.ETH,  change: '',      verified: true, isNestedParent: true, tokensCount: 1, subTokens: [] as {symbol:string;name:string;chain:string;balance:string;price:number;change:string;displayBalance:string;verified:boolean}[] },
        { symbol: 'BNB',  name: 'BNB',           chain: 'BSC',  balance: balances?.bnb      || '0', price: PRICES.BNB,  change: '',      verified: true },
        { symbol: 'POL',  name: 'Polygon',       chain: 'Polygon', balance: balances?.pol   || '0', price: PRICES.POL,  change: '',      verified: true },
    ].filter(a => parseFloat(a.balance) > 0);

    // Dynamic total value from live balances
    const totalValue = liveAssets.reduce((sum, a) => sum + parseFloat(a.balance) * a.price, 0);

    const staticAssets = liveAssets;


    // Filter results based on search/chain filter
    const filteredAssets = staticAssets.filter(item => {
        if (chainFilter !== 'All' && item.chain !== chainFilter) return false;
        if (selectorSearch) {
            const s = selectorSearch.toLowerCase();
            return item.name.toLowerCase().includes(s) || item.symbol.toLowerCase().includes(s);
        }
        return true;
    });

    if (showSearchOverlay) {
        // Token selector — must be checked BEFORE showSend so it always renders on top
        return (
            <div className="page wallet-page animate-in">
                <div className="search-header-row">
                    <input
                        type="text"
                        className="search-input-field"
                        placeholder="Search by name, chain or address"
                        value={selectorSearch}
                        onChange={e => setSelectorSearch(e.target.value)}
                        autoFocus
                    />
                    <span
                        onClick={() => { setShowSearchOverlay(false); setSelectorSearch(''); }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <IconX size={18} className="search-close-icon" />
                    </span>
                </div>

                <div className="chain-filters-scroll-row">
                    {['All', 'Ethereum', 'Arbitrum', 'Base', 'Polygon'].map(c => (
                        <button
                            key={c}
                            className={`chain-filter-pill ${chainFilter === c ? 'active' : ''}`}
                            onClick={() => setChainFilter(c)}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                <div className="search-results-list">
                    {filteredAssets.map((asset, i) => (
                        <div
                            className="token-list-item"
                            key={i}
                            onClick={() => {
                                setSendToken(asset.symbol);
                                // CRITICAL: set the chain so the send goes to the right network
                                const chainMap: Record<string, 'base' | 'bsc' | 'polygon'> = { 'Base': 'base', 'BSC': 'bsc', 'Polygon': 'polygon' };
                                setSendChain(chainMap[asset.chain] ?? 'base');
                                setChainFilter('All');
                                setShowSearchOverlay(false);
                            }}
                        >
                            <div className="token-list-item-left">
                                <div className="token-logo-container">
                                    {tokenIcons[asset.symbol] || <IconTokenETH size={32} />}
                                    <div className="chain-badge-overlay">
                                        {chainBadgeIcons[asset.chain]}
                                    </div>
                                </div>
                                <div className="token-details-text" style={{ marginLeft: 8 }}>
                                    <div className="token-details-title-row">
                                        <span className="token-details-name">{asset.name}</span>
                                        {asset.verified && <VerifiedBadge />}
                                    </div>
                                    <span className="token-details-subtitle">{asset.symbol}</span>
                                </div>
                            </div>
                            <div className="token-list-item-right">
                                <div className="token-value-text-col">
                                    <span className="token-value-amount">${(parseFloat(asset.balance) * asset.price).toFixed(2)}</span>
                                    <span className="token-value-change neutral">{asset.balance} {asset.symbol}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (showSend) {
        // Redesigned Send view
        return (
            <div className="page wallet-page animate-in">
                <div className="send-header" onClick={() => setShowSend(false)}>
                    <IconArrowLeft size={20} />
                    <span style={{ marginLeft: 8 }}>Send</span>
                </div>

                <div className="send-main-card">
                    <div className="send-card-header">
                        <span className="send-card-label">Send</span>
                        <div className="percent-pills-row">
                            {['25%', '50%', '75%', 'Max'].map(pct => (
                                <button
                                    key={pct}
                                    className="percent-pill-btn"
                                    onClick={() => {
                                        const factor = pct === '50%' ? 0.5 : pct === '75%' ? 0.75 : pct === 'Max' ? 1.0 : 0.25;
                                        const tokenBalance = parseFloat(
                                            staticAssets.find(a => a.symbol === sendToken && (chainMap2[a.chain] ?? 'base') === sendChain)?.balance || '0'
                                        );
                                        setSendAmount((tokenBalance * factor).toFixed(6));
                                    }}
                                >
                                    {pct}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="send-amount-row">
                        <input
                            type="text"
                            className="send-amount-input"
                            value={sendAmount || '0'}
                            onChange={e => setSendAmount(e.target.value)}
                        />
                        <div className="token-selector-pill" onClick={() => setShowSearchOverlay(true)}>
                            {tokenIcons[sendToken] || <IconTokenETH size={24} />}
                            <span className="token-selector-symbol" style={{ marginLeft: 6 }}>{sendToken}</span>
                            <span style={{ marginLeft: 2, fontSize: 10, color: '#848e9c' }}>({sendChain.toUpperCase()})</span>
                            <span style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center' }}><IconArrowDown size={14} /></span>
                        </div>
                    </div>

                    <div className="send-amount-subtext-row">
                        <div className="fiat-swap-wrapper">
                            <span>${(parseFloat(sendAmount || '0') * (PRICES[sendToken] ?? 1)).toFixed(2)}</span>
                            <span style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center' }}><IconSwap size={14} /></span>
                        </div>
                        <span>{(parseFloat(staticAssets.find(a => a.symbol === sendToken && (chainMap2[a.chain] ?? 'base') === sendChain)?.balance || '0')).toFixed(6)} {sendToken} available ({sendChain.toUpperCase()})</span>
                    </div>

                    <div className="send-card-divider" />

                    <button className="send-action-btn-blue" onClick={handleSend} disabled={sending}>
                        {sending ? 'Sending...' : `Send ${sendToken}`}
                    </button>
                </div>

                {/* ── Destination Wallet ── */}
                <div className="destination-section-header">
                    <span className="destination-section-title">Destination wallet</span>
                    <button className="contact-add-btn" onClick={() => setShowAddContact(v => !v)} title="Save new contact">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        Add contact
                    </button>
                </div>

                {/* Add contact form */}
                {showAddContact && (
                    <div className="add-contact-card">
                        <input
                            className="contact-input"
                            placeholder="Name (e.g. Alice)"
                            value={newContactName}
                            onChange={e => setNewContactName(e.target.value)}
                        />
                        <input
                            className="contact-input"
                            placeholder="Wallet address (0x…)"
                            value={newContactAddress}
                            onChange={e => setNewContactAddress(e.target.value)}
                        />
                        <div className="add-contact-actions">
                            <button className="contact-cancel-btn" onClick={() => { setShowAddContact(false); setNewContactName(''); setNewContactAddress(''); }}>Cancel</button>
                            <button className="contact-save-btn" onClick={saveContact}>Save</button>
                        </div>
                    </div>
                )}

                {/* Saved contacts list */}
                {savedContacts.length > 0 && (
                    <div className="contacts-list">
                        {savedContacts.map((c, i) => (
                            <div
                                key={i}
                                className={`contact-item ${selectedContact?.address === c.address ? 'selected' : ''}`}
                                onClick={() => { setSelectedContact(c); setSendTo(c.address); }}
                            >
                                <div className="contact-avatar">{c.name.charAt(0).toUpperCase()}</div>
                                <div className="contact-info">
                                    <span className="contact-name">{c.name}</span>
                                    <span className="contact-addr">{c.address.slice(0, 8)}…{c.address.slice(-6)}</span>
                                </div>
                                <button
                                    className="contact-delete-btn"
                                    onClick={e => { e.stopPropagation(); removeContact(i); }}
                                    title="Remove"
                                >
                                    <IconX size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Manual address input */}
                <div className="destination-input-card">
                    <IconWallet size={18} color="#8c9099" />
                    <input
                        className="destination-address-input"
                        placeholder="Or paste wallet address…"
                        value={sendTo}
                        onChange={e => { setSendTo(e.target.value); setSelectedContact(null); }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="page wallet-page animate-in">
            {/* Coming Soon Toast */}
            {showComingSoon && (
                <div className="coming-soon-toast">🚀 Coming Soon</div>
            )}

            {/* Header / Total Balance Card */}
            <div className="wallet-header-card">
                <svg className="wallet-header-wave" viewBox="0 0 400 100" preserveAspectRatio="none">
                    {/* Animated fill area under line 1 */}
                    <path
                        d="M0,65 Q50,40 100,60 T200,50 T300,58 T400,48 L400,100 L0,100 Z"
                        fill="rgba(6, 95, 70, 0.08)"
                        className="wave-fill"
                    />
                    {/* Primary wave line — fastest */}
                    <path
                        d="M0,65 Q50,40 100,60 T200,50 T300,58 T400,48"
                        fill="none"
                        stroke="rgba(6, 95, 70, 0.55)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        className="wave-line-1"
                    />
                    {/* Secondary wave line — medium */}
                    <path
                        d="M0,72 Q60,55 120,68 T240,60 T360,65 T400,58"
                        fill="none"
                        stroke="rgba(6, 95, 70, 0.30)"
                        strokeWidth="0.8"
                        strokeLinecap="round"
                        className="wave-line-2"
                    />
                    {/* Tertiary wave line — slowest */}
                    <path
                        d="M0,78 Q80,65 160,76 T320,70 T400,66"
                        fill="none"
                        stroke="rgba(6, 95, 70, 0.15)"
                        strokeWidth="0.5"
                        strokeLinecap="round"
                        className="wave-line-3"
                    />
                </svg>

                <div className="wallet-label">Total Asset Value (Est.)</div>
                <div className="wallet-total">${totalValue.toFixed(2)}</div>
                <div className="wallet-subtotal">≈ ₹{(totalValue * 87).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>

                <div className="wallet-address-copy-row" onClick={copyAddress}>
                    <IconCopy size={14} color="#8c9099" />
                    <span className="wallet-address-copy-text" style={{ marginLeft: 6 }}>
                        {((balances?.address || user?.wallet_address || wagmiAddress || '0x0000000000000000000000000000000000000000') as string).slice(0, 6)}...{((balances?.address || user?.wallet_address || wagmiAddress || '0x0000000000000000000000000000000000000000') as string).slice(-4)}
                    </span>
                </div>
            </div>

            {/* Actions Grid (3-column, removed Buy button) */}
            <div className="actions-row">
                <button className="action-card-btn" onClick={() => setShowSend(true)}>
                    <div className="action-card-icon">
                        <IconSend size={24} />
                    </div>
                    <span className="action-card-label">Send</span>
                </button>
                <button className="action-card-btn active" onClick={triggerComingSoon}>
                    <div className="action-card-icon">
                        <IconSwap size={24} />
                    </div>
                    <span className="action-card-label">Swap</span>
                </button>
                <button className="action-card-btn" onClick={() => setShowReceive(true)}>
                    <div className="action-card-icon">
                        <IconArrowDown size={24} />
                    </div>
                    <span className="action-card-label">Deposit</span>
                </button>
            </div>

            {/* P2P Escrow Vault Section */}
            <div className="vault-section">
                <div className="vault-header-row">
                    <div className="vault-title-wrap">
                        <IconLock size={18} color="#10b981" />
                        <span>P2P Escrow Vault</span>
                        <span className="vault-info-trigger-btn" onClick={() => setShowVaultInfo(!showVaultInfo)}>
                            <IconInfo size={18} color="#8c9099" />
                        </span>
                    </div>
                    <div className="vault-header-actions">
                        <button className="vault-btn topup" onClick={() => { setShowVaultAction('deposit'); setVaultError(''); setVaultSuccess(''); }}>
                            + Top Up
                        </button>
                        <button className="vault-btn withdraw" onClick={() => { setShowVaultAction('withdraw'); setVaultError(''); setVaultSuccess(''); }}>
                            Withdraw
                        </button>
                    </div>
                </div>

                {showVaultInfo && (
                    <div className="vault-info-banner animate-in">
                        <span>Funds in the P2P Vault are held securely on-chain. You must deposit funds here before you can create P2P Sell ads.</span>
                    </div>
                )}

                <div className="vault-grid">
                    {/* USDC Base */}
                    <div className="vault-item-card">
                        <div className="vault-item-top">
                            <div className="vault-item-token-info">
                                <div className="vault-item-icon"><IconTokenUSDC size={28} /></div>
                                <span className="vault-item-symbol">USDC</span>
                            </div>
                            <span className="vault-item-chain-badge">Base</span>
                        </div>
                        <div className="vault-item-balance">{parseFloat(vaultBaseUsdc).toFixed(2)}</div>
                        <div className="vault-item-fiat">≈ ${parseFloat(vaultBaseUsdc).toFixed(2)}</div>
                    </div>
                    {/* USDT Base */}
                    <div className="vault-item-card">
                        <div className="vault-item-top">
                            <div className="vault-item-token-info">
                                <div className="vault-item-icon"><IconTokenUSDT size={28} /></div>
                                <span className="vault-item-symbol">USDT</span>
                            </div>
                            <span className="vault-item-chain-badge">Base</span>
                        </div>
                        <div className="vault-item-balance">{parseFloat(vaultBaseUsdt).toFixed(2)}</div>
                        <div className="vault-item-fiat">≈ ${parseFloat(vaultBaseUsdt).toFixed(2)}</div>
                    </div>
                    {/* USDC BSC */}
                    <div className="vault-item-card">
                        <div className="vault-item-top">
                            <div className="vault-item-token-info">
                                <div className="vault-item-icon"><IconTokenUSDC size={28} /></div>
                                <span className="vault-item-symbol">USDC</span>
                            </div>
                            <span className="vault-item-chain-badge">BSC</span>
                        </div>
                        <div className="vault-item-balance">{parseFloat(vaultBscUsdc).toFixed(2)}</div>
                        <div className="vault-item-fiat">≈ ${parseFloat(vaultBscUsdc).toFixed(2)}</div>
                    </div>
                    {/* USDT BSC */}
                    <div className="vault-item-card">
                        <div className="vault-item-top">
                            <div className="vault-item-token-info">
                                <div className="vault-item-icon"><IconTokenUSDT size={28} /></div>
                                <span className="vault-item-symbol">USDT</span>
                            </div>
                            <span className="vault-item-chain-badge">BSC</span>
                        </div>
                        <div className="vault-item-balance">{parseFloat(vaultBscUsdt).toFixed(2)}</div>
                        <div className="vault-item-fiat">≈ ${parseFloat(vaultBscUsdt).toFixed(2)}</div>
                    </div>
                    {/* BNB BSC */}
                    <div className="vault-item-card">
                        <div className="vault-item-top">
                            <div className="vault-item-token-info">
                                <div className="vault-item-icon"><IconTokenBNB size={28} /></div>
                                <span className="vault-item-symbol">BNB</span>
                            </div>
                            <span className="vault-item-chain-badge">BSC</span>
                        </div>
                        <div className="vault-item-balance">{parseFloat(vaultBscBnb).toFixed(4)}</div>
                        <div className="vault-item-fiat">≈ ${parseFloat(vaultBscBnb).toFixed(2)}</div>
                    </div>
                </div>
            </div>

            {/* Tokens Section Header (Removed collections tabs) */}
            <div className="tokens-tabs-container">
                <div className="tabs-left">
                    <span style={{ fontSize: 16, fontWeight: 700, padding: '12px 4px', color: 'var(--text-primary)' }}>Tokens</span>
                </div>
                <div className="tabs-right-actions">
                    <span className="tab-icon-action" onClick={() => setShowSearchOverlay(true)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </span>
                    <span className="tab-icon-action" onClick={() => showToast("Filters coming soon", "info")}>
                        <IconFilter size={20} />
                    </span>
                </div>
            </div>

            {/* Token List */}
            <div className="token-list-wrapper">
                {staticAssets.map((asset, i) => (
                    <div key={i}>
                        {asset.isNestedParent ? (
                            <>
                                {/* Collapsible Nested Parent */}
                                <div className="token-list-item" onClick={() => setEthExpanded(!ethExpanded)}>
                                    <div className="token-list-item-left">
                                        <div className="token-logo-container">
                                            {tokenIcons[asset.symbol]}
                                        </div>
                                        <div className="token-details-text" style={{ marginLeft: 12 }}>
                                            <div className="token-details-title-row">
                                                <span className="token-details-name">{asset.name}</span>
                                                {asset.verified && <VerifiedBadge />}
                                            </div>
                                            <span className="token-details-subtitle">{asset.tokensCount} tokens</span>
                                        </div>
                                    </div>
                                    <div className="token-list-item-right">
                                        <div className="token-value-text-col">
                                            <span className="token-value-amount">${(parseFloat(asset.balance) * asset.price).toFixed(2)}</span>
                                            <span className="token-value-change positive">{asset.change}</span>
                                        </div>
                                        <div style={{ transform: ethExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'flex', alignItems: 'center', marginLeft: 8 }}>
                                            <IconChevronRight size={18} color="#8c9099" />
                                        </div>
                                    </div>
                                </div>

                                {/* Indented child networks */}
                                {ethExpanded && asset.subTokens && (
                                    <div className="nested-assets-container animate-in">
                                        {asset.subTokens.map((sub, idx) => (
                                            <div className="token-list-item" key={idx}>
                                                <div className="token-list-item-left">
                                                    <div className="token-logo-container">
                                                        {tokenIcons[sub.symbol]}
                                                        <div className="chain-badge-overlay">
                                                            {chainBadgeIcons[sub.chain]}
                                                        </div>
                                                    </div>
                                                    <div className="token-details-text" style={{ marginLeft: 12 }}>
                                                        <div className="token-details-title-row">
                                                            <span className="token-details-name">{sub.name}</span>
                                                            {sub.verified && <VerifiedBadge />}
                                                        </div>
                                                        <span className="token-details-subtitle">{sub.chain}</span>
                                                    </div>
                                                </div>
                                                <div className="token-list-item-right">
                                                    <div className="token-value-text-col">
                                                        <span className="token-value-amount">{sub.displayBalance}</span>
                                                        <span className="token-value-change neutral">{sub.change}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="token-list-item">
                                <div className="token-list-item-left">
                                    <div className="token-logo-container">
                                        {tokenIcons[asset.symbol] || <IconTokenETH size={32} />}
                                        <div className="chain-badge-overlay">
                                            {chainBadgeIcons[asset.chain]}
                                        </div>
                                    </div>
                                    <div className="token-details-text" style={{ marginLeft: 12 }}>
                                        <div className="token-details-title-row">
                                            <span className="token-details-name">{asset.name}</span>
                                            {asset.verified && <VerifiedBadge />}
                                        </div>
                                        <span className="token-details-subtitle">{asset.balance} {asset.symbol} · {asset.chain}</span>
                                    </div>
                                </div>
                                <div className="token-list-item-right">
                                    <div className="token-value-text-col">
                                        <span className="token-value-amount">
                                            ${(parseFloat(asset.balance) * asset.price).toFixed(2)}
                                        </span>
                                        <span className={`token-value-change ${asset.change.startsWith('+') ? 'positive' : asset.change.startsWith('-') ? 'negative' : 'neutral'}`}>
                                            {asset.change}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* ═══ MODALS ═══ */}

            {/* Manage Funds / Deposit Modal */}
            {showReceive && (
                <div className="modal-overlay" onClick={() => setShowReceive(false)}>
                    <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ width: '100%', textAlign: 'center' }}>{(balances?.address || user?.wallet_address) ? 'Deposit Crypto' : 'Receive Crypto'}</h3>
                        <p className="text-sm text-muted mb-2">Scan or copy address to receive funds</p>
                        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', margin: '16px auto', display: 'inline-block' }}>
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${balances?.address || user?.wallet_address || wagmiAddress}`} alt="QR" width={150} height={150} style={{ display: 'block' }} />
                        </div>
                        <div className="p-2 bg-secondary rounded mb-4 mono text-sm select-all" style={{ wordBreak: 'break-all', width: '100%', boxSizing: 'border-box' }}>
                            {balances?.address || user?.wallet_address || wagmiAddress}
                        </div>
                        <button className="btn btn-primary btn-block" onClick={copyAddress} style={{ width: '100%', background: 'var(--color-blue)' }}>
                            Copy Address
                        </button>
                    </div>
                </div>
            )}

            {/* Vault Action Modal */}
            {showVaultAction && (
                <div className="modal-overlay" onClick={() => setShowVaultAction(null)}>
                    <div className="modal-content redesign-inner" onClick={e => e.stopPropagation()}>
                        <h3>{showVaultAction === 'deposit' ? 'Top Up Vault' : 'Withdraw from Vault'}</h3>

                        {/* Chain Selection (Segmented Control) */}
                        <div className="selection-group">
                            <label className="selection-label">Select Chain</label>
                            <div className="segmented-control">
                                <button
                                    className={`segmented-btn chain-base ${vaultChain === 'base' ? 'active' : ''}`}
                                    onClick={() => { setVaultChain('base'); if (vaultToken === 'BNB') setVaultToken('USDT'); }}
                                >
                                    <IconChainBase size={14} /> Base
                                </button>
                                <button
                                    className={`segmented-btn chain-bsc ${vaultChain === 'bsc' ? 'active' : ''}`}
                                    onClick={() => setVaultChain('bsc')}
                                >
                                    <IconChainBsc size={14} /> BSC
                                </button>
                            </div>
                        </div>

                        {/* Token Selection (Grid) */}
                        <div className="selection-group">
                            <label className="selection-label">Select Token</label>
                            <div className="token-grid">
                                {['USDT', 'USDC', ...(vaultChain === 'bsc' ? ['BNB'] : [])].map(t => (
                                    <button
                                        key={t}
                                        className={`token-btn ${vaultToken === t ? 'active' : ''}`}
                                        onClick={() => setVaultToken(t as any)}
                                    >
                                        <div className="token-btn-icon">
                                            {t === 'USDC' && <IconTokenUSDC size={18} />}
                                            {t === 'USDT' && <IconTokenUSDT size={18} />}
                                            {t === 'BNB' && <IconTokenBNB size={18} />}
                                        </div>
                                        <span className="token-btn-symbol">{t}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Balance Hint */}
                        <div className="modal-stat-card">
                            <span className="modal-stat-label">
                                {showVaultAction === 'deposit' ? 'Wallet Balance' : 'Available in Vault'}
                            </span>
                            <div className="modal-stat-value">
                                {showVaultAction === 'deposit' ? (
                                    user?.wallet_type === 'external' ? (
                                        formatBal(getExtBalance(vaultToken, vaultChain), vaultToken === 'BNB' ? 4 : 2)
                                    ) : (
                                        formatBal(vaultChain === 'base'
                                            ? (vaultToken === 'USDC' ? balances?.usdc : balances?.usdt)
                                            : (vaultToken === 'USDC' ? balances?.bsc_usdc : vaultToken === 'USDT' ? balances?.bsc_usdt : balances?.bnb),
                                            vaultToken === 'BNB' ? 4 : 2
                                        )
                                    )
                                ) : (
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

                        {/* Amount Input */}
                        <div className="modal-input-wrapper">
                            <input
                                type="number"
                                placeholder="0.00"
                                className="modal-input-field"
                                value={vaultAmount}
                                onChange={e => setVaultAmount(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {vaultError && <div className="text-red text-center text-sm mb-3">{vaultError}</div>}
                        {vaultSuccess && <div className="text-green text-center text-sm mb-3">{vaultSuccess}</div>}

                        {user?.wallet_type === 'external' && currentChainId !== (vaultChain === 'bsc' ? bsc.id : base.id) ? (
                            <button
                                className="modal-action-btn"
                                onClick={() => smartSwitch(vaultChain === 'bsc' ? bsc.id : base.id)}
                                disabled={vaultLoading}
                            >
                                {vaultLoading ? 'Switching...' : `Switch to ${vaultChain.toUpperCase()}`}
                            </button>
                        ) : showVaultAction === 'deposit' && user?.wallet_type === 'external' && vaultNeedsApproval && vaultStep !== 'approved' ? (
                            <button
                                className="modal-action-btn"
                                onClick={handleVaultApprove}
                                disabled={vaultLoading || !vaultAmount || parseFloat(vaultAmount) <= 0}
                            >
                                {vaultLoading ? 'Approving...' : `Step 1: Approve ${vaultToken}`}
                            </button>
                        ) : (
                            <button
                                className="modal-action-btn"
                                onClick={handleVaultAction}
                                disabled={vaultLoading || !vaultAmount || parseFloat(vaultAmount) <= 0}
                            >
                                {vaultLoading ? 'Processing...' : (showVaultAction === 'deposit' ? (user?.wallet_type === 'external' ? 'Step 2: Deposit' : 'Confirm Deposit') : 'Confirm Withdraw')}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
