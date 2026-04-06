import './WalletSelector.css';
import { haptic } from '../lib/telegram';
import { IconShield, IconLink, IconBot } from './Icons';

interface Props {
    onSelectBot: () => void;
    onSelectExternal: () => void;
    loading?: boolean;
}

export function WalletSelector({ onSelectBot, onSelectExternal, loading }: Props) {
    return (
        <div className="wallet-selector animate-in">
            <div className="ws-header">
                <div className="ws-icon"><IconShield size={48} color="var(--green)" /></div>
                <h2>Choose Your Wallet</h2>
                <p className="text-secondary text-sm">
                    Select how you want to manage your crypto
                </p>
            </div>

            <div className="ws-options">
                <button
                    className="ws-option"
                    onClick={() => { haptic('medium'); onSelectExternal(); }}
                    disabled={loading}
                >
                    <div className="ws-option-icon"><IconLink size={28} color="var(--blue)" /></div>
                    <div className="ws-option-content">
                        <h3>Connect Wallet</h3>
                        <p>MetaMask, Bitget, Trust Wallet & more</p>
                        <span className="badge badge-blue">You control keys</span>
                    </div>
                    <span className="ws-arrow">›</span>
                </button>

                <button
                    className="ws-option"
                    onClick={() => { haptic('medium'); onSelectBot(); }}
                    disabled={loading}
                >
                    <div className="ws-option-icon"><IconBot size={28} color="var(--green)" /></div>
                    <div className="ws-option-content">
                        <h3>Bot Wallet</h3>
                        <p>Zero-setup, instant & automatic</p>
                        <span className="badge badge-green">Recommended</span>
                    </div>
                    <span className="ws-arrow">›</span>
                </button>
            </div>

            <p className="ws-footer text-muted text-xs text-center">
                You can switch wallet type anytime in Settings
            </p>
        </div>
    );
}
