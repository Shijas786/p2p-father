import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { haptic } from '../lib/telegram';
import './Rewards.css';

const ProgressParticles = () => (
  <div className="progress-particles">
    <svg className="pp p1" viewBox="0 0 24 24"><path fill="#fff" opacity="0.6" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    <svg className="pp p2" viewBox="0 0 24 24"><circle fill="#fff" opacity="0.6" cx="12" cy="12" r="8"/></svg>
    <svg className="pp p3" viewBox="0 0 24 24"><path fill="#fff" opacity="0.6" d="M12 2v20m10-10H2" stroke="#fff" strokeWidth="4" strokeLinecap="round"/></svg>
  </div>
);

export function Rewards({ user, onSwitchWallet }: { user: any, onSwitchWallet: () => void }) {
  const { address, isConnected } = useAccount();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [signatureData, setSignatureData] = useState<any>(null);
  
  const { writeContract, data: hash, error: writeError, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (address) {
      checkEligibility();
    }
  }, [address]);

  useEffect(() => {
    if (isConfirmed) {
      showToast("Rewards successfully claimed!", "success");
      haptic('success');
      setSignatureData(null); // Reset after claiming
    }
  }, [isConfirmed]);

  const checkEligibility = async () => {
    if (!address) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/miniapp/referrals/claim-signature?address=${address}`, {
        headers: {
          'x-telegram-init-data': window.Telegram?.WebApp?.initData || '',
        }
      });
      const data = await res.json();
      if (data.success) {
        setSignatureData(data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = () => {
    if (!signatureData || !address) return;
    haptic('medium');
    writeContract({
      address: signatureData.contractAddress as `0x${string}`,
      abi: [
        {
          "inputs": [
            { "internalType": "uint256", "name": "totalQualifiedInvites", "type": "uint256" },
            { "internalType": "bytes", "name": "signature", "type": "bytes" }
          ],
          "name": "claimRewards",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ],
      functionName: 'claimRewards',
      args: [
        BigInt(signatureData.totalQualifiedInvites),
        signatureData.signature as `0x${string}`
      ],
    });
  };

  const USDC_REWARD = "0.25";
  const REQUIRED_INVITES = 5;
  const currentInvites = user?.qualified_invites || 0;
  const progressPercent = Math.min(100, (currentInvites / REQUIRED_INVITES) * 100);
  const isEligible = currentInvites >= REQUIRED_INVITES;

  return (
    <div className="rewards-page animate-in">
      <div className="rewards-header">
        <h1 className="rewards-title">Bounty Hub</h1>
        <p className="rewards-subtitle">Complete quests, invite traders, and earn crypto rewards directly to your wallet.</p>
      </div>

      <div className="campaign-container">
        {/* Quest Card 1 - Gold Theme */}
        <div className="quest-card theme-gold">
          <div className="quest-badge">Active Quest</div>
          <h2 className="quest-title">Referral Sprint</h2>
          
          <div className="quest-reward">
            <span>🎁</span>
            {USDC_REWARD} USDC
            <span style={{ fontSize: '12px', color: '#fff', fontWeight: 500, marginLeft: 6, textShadow: 'none' }}>per 5 invites</span>
          </div>

          <div className="steps-list">
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-text">Share your unique invite link with friends or fellow traders.</div>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-text">Ensure they successfully launch the mini-app and join.</div>
            </div>
            <div className="step-item">
              <div className="step-number">3</div>
              <div className="step-text">Claim <strong>{USDC_REWARD} USDC</strong> for every <strong>{REQUIRED_INVITES}</strong> successful joins!</div>
            </div>
          </div>

          <div className="progress-section">
            <div className="progress-header">
              <span className="progress-label">Quest Progress</span>
              <span className="progress-value">
                <span>{currentInvites}</span> / {REQUIRED_INVITES}
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }}>
                <ProgressParticles />
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '14px', color: 'var(--text-light)', fontWeight: 800 }}>
              {isEligible 
                ? "🎉 Target reached! You can claim now." 
                : `${REQUIRED_INVITES - currentInvites} more invites needed to claim.`}
            </div>
          </div>

          <div className="btn-row">
            <button 
              className="claim-btn btn-secondary" 
              onClick={() => {
                const inviteLink = `https://t.me/P2PFatherBot/app?startapp=ref_${user?.id}`;
                navigator.clipboard.writeText(inviteLink);
                showToast("Referral link copied!", "success");
                haptic('success');
              }}
            >
              Copy Link
            </button>
            {user?.wallet_type === 'external' ? (
                <button 
                  className="claim-btn" 
                  onClick={() => { haptic('medium'); onSwitchWallet(); }}
                >
                  Switch Wallet
                </button>
            ) : !address || loading ? (
              <button className="claim-btn" disabled>
                Loading...
              </button>
            ) : isEligible ? (
              <button 
                  className="claim-btn"
                  onClick={handleClaim}
                  disabled={isPending || isConfirming || isConfirmed}
              >
                  {isConfirmed ? "Claimed!" : isPending || isConfirming ? "Wait..." : `Claim`}
              </button>
            ) : (
              <button className="claim-btn" disabled>
                Locked
              </button>
            )}
          </div>
          
          {writeError && <div className="tx-error">{writeError.message}</div>}
          {hash && <div className="tx-hash">Transaction Sent!</div>}
        </div>

        {/* Coming Soon Card 1 */}
        <div className="quest-card coming-soon theme-cyan">
          <div className="quest-badge inactive">Coming Soon</div>
          <h2 className="quest-title">First Trade Bonus</h2>
          <div className="quest-reward" style={{ background: '#9ca3af', borderColor: '#555', boxShadow: '0 4px 0 #555' }}>
            <span>🎁</span>
            0.50 USDC
          </div>
          <div className="steps-list" style={{ opacity: 0.5 }}>
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-text">Complete your first P2P trade on the platform.</div>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-text">Maintain a 100% completion rate for 24 hours.</div>
            </div>
          </div>
        </div>

        {/* Coming Soon Card 2 */}
        <div className="quest-card coming-soon theme-purple">
          <div className="quest-badge inactive">Coming Soon</div>
          <h2 className="quest-title">Daily Login Streak</h2>
          <div className="quest-reward" style={{ background: '#9ca3af', borderColor: '#555', boxShadow: '0 4px 0 #555' }}>
            <span>🎁</span>
            0.10 USDC
          </div>
          <div className="steps-list" style={{ opacity: 0.5 }}>
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-text">Log in to the app for 7 consecutive days.</div>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-text">Claim your weekly activity bonus.</div>
            </div>
          </div>
        </div>

        {/* Coming Soon Card 3 */}
        <div className="quest-card coming-soon theme-red">
          <div className="quest-badge inactive">Coming Soon</div>
          <h2 className="quest-title">Whale Hunter</h2>
          <div className="quest-reward" style={{ background: '#9ca3af', borderColor: '#555', boxShadow: '0 4px 0 #555' }}>
            <span>🎁</span>
            5.00 USDC
          </div>
          <div className="steps-list" style={{ opacity: 0.5 }}>
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-text">Complete a single P2P trade over $1,000.</div>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-text">Leave positive feedback for your trading partner.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}