import { useState, useEffect, useRef, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { WagmiProvider, useAccount, useConnect, useDisconnect } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig, appKit } from './lib/wagmi';
import { getTelegramWebApp, setupTelegramApp, isTelegramEnvironment } from './lib/telegram';
import { useAuth } from './hooks/useAuth';
import { api } from './lib/api';
import { hotWalletConnector } from './utils/hotWalletConnector';

import { Layout } from './components/Layout';
import { WalletSelector } from './components/WalletSelector';
import { Home } from './pages/Home';
import { Orders } from './pages/Orders';
import { CreateOrder } from './pages/CreateOrder';
import { TradeDetail } from './pages/TradeDetail';
import { Wallet } from './pages/Wallet';

import { WhatsAppLogin } from './pages/WhatsAppLogin';
import { Profile } from './pages/Profile';
import { MyAds } from './pages/MyAds';
import { Admin } from './pages/Admin';
import { Leaderboard } from './pages/Leaderboard';
import { Rewards } from './pages/Rewards';
import { WalletSwitcherModal } from './components/WalletSwitcherModal';
import { ToastProvider } from './components/Toast';
import { MaintenanceNotice } from './components/MaintenanceNotice';
import { APP_VERSION } from './constants';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30000 },
  },
});

// Error Boundary to prevent white-screen crashes
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[P2PFather] Crash:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', padding: 24,
          background: '#050505', color: '#fff', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>{this.state.error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', background: '#00D26A', color: '#000',
              border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Dev / local shortcut ──────────────────────────────────────────────────
// When running outside of Telegram (e.g. `npm run dev` in the browser),
// skip the wallet selector and the WalletConnect popup entirely so you can
// iterate on UI without the full auth ceremony every refresh.
const IS_DEV_MODE = !isTelegramEnvironment();

function AppInner() {
  const { user, loading, refreshUser, setUser } = useAuth();
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors } = useConnect();
  // In dev mode start with wallet already "chosen" so the selector is skipped
  const [walletChosen, setWalletChosen] = useState(IS_DEV_MODE);
  const [walletMode, setWalletMode] = useState<'bot' | 'external' | null>(IS_DEV_MODE ? 'bot' : null);
  const [connecting, setConnecting] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [showWalletSwitcher, setShowWalletSwitcher] = useState(false);

  // Track if we've already tried to auto-login to external wallet
  // This prevents an infinite loop when the user explicitly clicks "Switch Wallet"
  const autoSelectAttempted = useRef(false);

  useEffect(() => {
    setupTelegramApp();

    // Patch window.open so WalletConnect deep links work inside Telegram's iframe.
    // Bitget Wallet (and others) need window.open to forward to Telegram's openLink.
    // We do this manually (instead of overrideWindowOpen) so we can safely catch
    // "Attempted an unsupported operation" errors on older Telegram clients.
    if (window.Telegram?.WebApp) {
      const _origOpen = window.open.bind(window);
      window.open = (url?: string | URL, target?: string, features?: string): Window | null => {
        if (url) {
          const href = url.toString();
          try {
            window.Telegram?.WebApp?.openLink(href);
            return null;
          } catch {
            // Telegram client doesn't support openLink — fall back to native
            return _origOpen(href, target, features);
          }
        }
        return _origOpen(url as string, target, features);
      };
    }
  }, []);

  // Auto-connect Hot Wallet if mode is bot
  useEffect(() => {
    if (walletMode !== 'bot') return;
    
    if (isConnected && connector?.id === 'hotWallet') return;

    if (isConnected && connector?.id !== 'hotWallet') {
      console.log('[P2P] Disconnecting external wallet to switch to hot wallet...');
      disconnect();
      return;
    }
    
    console.log('[P2P] Attempting to connect hot wallet...');
    const hwc = connectors.find(c => c.id === 'hotWallet');
    if (!hwc) {
      console.error('[P2P] Hot wallet connector not found in wagmi config');
      return;
    }
    connect({ connector: hwc }, {
      onSuccess: () => console.log('[P2P] Hot wallet connected successfully!'),
      onError: (err) => console.error('[P2P] Hot wallet connection failed:', err)
    });
  }, [walletMode, isConnected, connector, connect, connectors, disconnect]);

  // Only auto-skip selector for returning EXTERNAL wallet users
  // Bot wallet users always see the selector so they can switch to WalletConnect
  useEffect(() => {
    if (user && !walletChosen && !connecting && !loading && !autoSelectAttempted.current) {
      autoSelectAttempted.current = true;
      if (user.wallet_address && user.wallet_type === 'external') {
        console.log('[P2P] Returning external wallet user:', user.wallet_address);
        setWalletMode('external');
        setWalletChosen(true);
      }
      // Bot wallet users and new users see the selector
    }
  }, [user, walletChosen, connecting, loading]);

  // When wagmi detects a connected external wallet, save it to backend
  useEffect(() => {
    if (walletMode === 'external' && isConnected && address && connector?.id !== 'hotWallet' && !savingAddress) {
      const isMismatch = user && user.wallet_address && address.toLowerCase() !== user.wallet_address.toLowerCase();

      if (!walletChosen || isMismatch) {
        console.log('[P2P] External wallet connected:', address, isMismatch ? '(Address change detected)' : '');
        setSavingAddress(true);
        setConnecting(true);

        api.wallet.connectExternal(address)
          .then(() => {
            console.log('[P2P] External address saved to backend');
            appKit.close(); // Force modal to close if it's stuck open
            return refreshUser();
          })
          .then(() => {
            console.log('[P2P] User refreshed with current wallet');
            setWalletChosen(true);
            setConnecting(false);
            setSavingAddress(false);
          })
          .catch((err) => {
            console.error('[P2P] Failed to save external wallet:', err);
            setConnecting(false);
            setSavingAddress(false);
            setWalletChosen(true); // show app anyway
          });
      }
    }
  }, [walletMode, isConnected, address, connector, savingAddress, walletChosen, user, refreshUser]);

  const handleSwitchWallet = async () => {
    setShowWalletSwitcher(true);
  };

  const DeepLinkHandler = () => {
    const navigate = useNavigate();
    const processed = useRef(false);

    useEffect(() => {
      if (processed.current) return;

      const webapp = getTelegramWebApp();
      const startParam = webapp?.initDataUnsafe?.start_param;

      if (startParam) {
        console.log('[P2P] Deep link detected:', startParam);
        if (startParam.startsWith('trade_')) {
          const tradeId = startParam.replace('trade_', '');
          navigate(`/trade/${tradeId}`);
        } else if (startParam.startsWith('buy_') || startParam.startsWith('order_')) {
          const orderId = startParam.replace(/^(buy_|order_)/, '');
          navigate(`/trade/new/${orderId}`);
        }
      }
      processed.current = true;
    }, [navigate]);

    return null;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="logo">P2PFather</div>
        <div className="spinner spinner-lg" />
        <span className="text-xs text-muted">Initializing...</span>
        <div style={{ position: 'absolute', bottom: 20, fontSize: 10, opacity: 0.4 }}>v{APP_VERSION}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <WhatsAppLogin
        onSuccess={() => {
          refreshUser();
          setWalletChosen(true);
          setWalletMode('bot');
        }}
      />
    );
  }

  // Show connecting state while saving external wallet
  if (connecting) {
    return (
      <div className="loading-screen">
        <div className="logo">P2PFather</div>
        <div className="spinner spinner-lg" />
        <span className="text-xs text-muted">Connecting wallet...</span>
        <div style={{ position: 'absolute', bottom: 20, fontSize: 10, opacity: 0.4 }}>v{APP_VERSION}</div>
      </div>
    );
  }

  // Show wallet selector for NEW users only (no wallet in DB)
  if (!walletChosen) {
    return (
      <WalletSelector
        onSelectBot={() => {
          setConnecting(true);
          console.log('[P2P] User clicked Bot Wallet. Connecting...');
          api.wallet.connectBot()
            .then(() => refreshUser())
            .then(() => {
              setWalletMode('bot');
              setWalletChosen(true);
              setConnecting(false);
              console.log('[P2P] Bot Wallet connected & user refreshed successfully!');
            })
            .catch(err => {
              console.error('[P2P] Error connecting Bot Wallet:', err);
              alert("Bot Wallet Connection Error: " + (err.message || String(err)));
              setConnecting(false);
            });
        }}
        onSelectExternal={async () => {
          setWalletMode('external');
          console.log('[P2P] Opening WalletConnect modal...');
          await appKit.open();

          setTimeout(() => {
            console.log('[P2P] After modal open, wagmi state:', { isConnected, address, connectorId: connector?.id });
            if (isConnected && address && connector?.id !== 'hotWallet') {
              appKit.close();
            }
          }, 1500);
        }}
      />
    );
  }

  return (
    <>
      <MaintenanceNotice user={user} />
      <DeepLinkHandler />
      <WalletSwitcherModal
        isOpen={showWalletSwitcher}
        onClose={() => setShowWalletSwitcher(false)}
        user={user}
        onUserRefresh={refreshUser}
        onSwitchMode={(mode) => setWalletMode(mode)}
      />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home user={user} />} />
          <Route path="orders" element={<Orders user={user} />} />
          <Route path="create" element={<CreateOrder />} />
          <Route path="trade/:id" element={<TradeDetail user={user} />} />
          <Route path="trade/new/:orderId" element={<TradeDetail user={user} />} />
          <Route path="wallet" element={<Wallet user={user} />} />

          <Route path="ads" element={<MyAds />} />
          <Route path="admin" element={<Admin user={user} />} />
          <Route path="rewards" element={<Rewards user={user} onSwitchWallet={handleSwitchWallet} />} />
          <Route path="profile" element={<Profile user={user} onUpdate={refreshUser} onSwitchWallet={handleSwitchWallet} />} />
          <Route path="leaderboard" element={<Leaderboard />} />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter basename={import.meta.env.DEV ? "/" : "/miniapp"}>
              <AppInner />
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default App;
