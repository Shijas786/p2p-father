import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { useAccount, useWriteContract, useConfig } from 'wagmi';
import { parseUnits } from 'viem';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { ESCROW_ABI, LEGACY_CONTRACTS } from '../lib/contracts';
import { bsc, base } from 'wagmi/chains';
import './Migration.css';

export function Migration() {
    const navigate = useNavigate();
    const [balances, setBalances] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [withdrawing, setWithdrawing] = useState<string | null>(null);
    const [error, setError] = useState('');

    const { address, isConnected, chain: walletChain } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const config = useConfig();

    useEffect(() => {
        loadBalances();
    }, []);

    async function loadBalances() {
        setLoading(true);
        try {
            const data = await api.wallet.getLegacyBalances();
            setBalances(data);
        } catch (err: any) {
            setError('Failed to load legacy balances');
        } finally {
            setLoading(false);
        }
    }

    async function handleWithdraw(chain: 'base' | 'bsc') {
        const amount = chain === 'base' ? balances.base_usdc : balances.bsc_usdc;
        if (!amount || parseFloat(amount) <= 0) return;

        haptic('medium');
        setWithdrawing(chain);
        setError('');

        try {
            const isExternal = !!address;
            const chainId = chain === 'bsc' ? bsc.id : base.id;

            if (isExternal) {
                if (walletChain?.id !== chainId) {
                    setError(`Please switch to ${chain.toUpperCase()} in your wallet first.`);
                    setWithdrawing(null);
                    return;
                }

                const escrowAddress = (LEGACY_CONTRACTS as any)[chain]?.escrow;
                const tokenAddress = chain === 'base'
                    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // USDC Base
                    : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"; // USDC BSC

                const hash = await writeContractAsync({
                    address: escrowAddress as `0x${string}`,
                    abi: ESCROW_ABI,
                    functionName: 'withdraw',
                    args: [tokenAddress, parseUnits(amount, chain === 'bsc' ? 18 : 6)],
                    chainId
                });

                await waitForTransactionReceipt(config, { hash });
            } else {
                // Bot Wallet
                await api.wallet.withdrawFromVault(parseFloat(amount), 'USDC', chain, true);
            }

            haptic('success');
            await loadBalances();
        } catch (err: any) {
            setError(err.message || 'Withdraw failed');
            haptic('error');
        } finally {
            setWithdrawing(null);
        }
    }

    if (loading) {
        return (
            <div className="page migration-page">
                <div className="loading-box">
                    <div className="spinner mb-2" />
                    Checking legacy contracts...
                </div>
            </div>
        );
    }

    const hasFunds = parseFloat(balances?.base_usdc || '0') > 0 || parseFloat(balances?.bsc_usdc || '0') > 0;

    return (
        <div className="page migration-page animate-in">
            <div className="flex items-center mb-6">
                <button className="btn-back mr-4" onClick={() => navigate(-1)}>←</button>
                <h2 className="m-0">Legacy Migration</h2>
            </div>

            <div className="migration-banner-full">
                <div className="icon">🛡️</div>
                <div className="content">
                    <div className="migration-title">Safety First</div>
                    <div className="migration-desc">
                        We've upgraded our smart contracts to support BNB and native assets.
                        Your existing funds are safe in the older contracts, but needs to be moved to the new one to be used in ads.
                    </div>
                </div>
            </div>

            {!hasFunds ? (
                <div className="card text-center py-8">
                    <div className="text-4xl mb-4">✅</div>
                    <h3>No Legacy Funds Found</h3>
                    <p className="text-muted">You're all set! All your funds are in the latest system.</p>
                    <button className="btn btn-primary mt-4" onClick={() => navigate('/wallet')}>
                        Go to Wallet
                    </button>
                </div>
            ) : (
                <div className="migration-grid">
                    {parseFloat(balances.base_usdc) > 0 && (
                        <div className="migration-item">
                            <div className="m-header">
                                <span className="m-chain">Base Mainnet</span>
                                <span className="m-token">USDC</span>
                            </div>
                            <div className="m-amount">{balances.base_usdc}</div>
                            <div className="m-label">Available in Legacy Vault</div>
                            <div className="m-footer">
                                <button
                                    className="btn btn-primary btn-block"
                                    disabled={withdrawing !== null}
                                    onClick={() => handleWithdraw('base')}
                                >
                                    {withdrawing === 'base' ? 'Withdrawing...' : 'Withdraw to Wallet'}
                                </button>
                            </div>
                        </div>
                    )}

                    {parseFloat(balances.bsc_usdc) > 0 && (
                        <div className="migration-item">
                            <div className="m-header">
                                <span className="m-chain">BSC Mainnet</span>
                                <span className="m-token">USDC</span>
                            </div>
                            <div className="m-amount">{balances.bsc_usdc}</div>
                            <div className="m-label">Available in Legacy Vault</div>
                            <div className="m-footer">
                                <button
                                    className="btn btn-primary btn-block"
                                    disabled={withdrawing !== null}
                                    onClick={() => handleWithdraw('bsc')}
                                >
                                    {withdrawing === 'bsc' ? 'Withdrawing...' : 'Withdraw to Wallet'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && <div className="error-box mt-4">{error}</div>}

            <p className="text-xs text-center text-muted mt-8">
                Once withdrawn to your wallet, you can deposit them back into the new P2P Escrow Vault on the Wallet page.
            </p>
        </div>
    );
}
