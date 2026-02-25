import { useState, useEffect, useRef, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig, appKit } from './lib/wagmi';
import { getTelegramWebApp, setupTelegramApp } from './lib/telegram';
import { useAuth } from './hooks/useAuth';
import { api } from './lib/api';
import { Layout } from './components/Layout';
import { WalletSelector } from './components/WalletSelector';
import { Home } from './pages/Home';
import { Orders } from './pages/Orders';
import { CreateOrder } from './pages/CreateOrder';
import { TradeDetail } from './pages/TradeDetail';
import { Wallet } from './pages/Wallet';

import { Profile } from './pages/Profile';
import { MyAds } from './pages/MyAds';
import { Admin } from './pages/Admin';
import { Leaderboard } from './pages/Leaderboard';
import { ToastProvider } from './components/Toast';
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

function AppInner() {
  const { user, loading, refreshUser } = useAuth();
  const { address, isConnected } = useAccount();
  const [walletChosen, setWalletChosen] = useState(false);
  const [walletMode, setWalletMode] = useState<'bot' | 'external' | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Track if we've already tried to auto-login to external wallet
  // This prevents an infinite loop when the user explicitly clicks "Switch Wallet"
  const autoSelectAttempted = useRef(false);

  useEffect(() => {
    setupTelegramApp();
  }, []);

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
    if (walletMode === 'external' && isConnected && address && !savingAddress && !walletChosen) {
      console.log('[P2P] External wallet connected via WalletConnect:', address);
      setSavingAddress(true);
      setConnecting(true);

      api.wallet.connectExternal(address)
        .then(() => {
          console.log('[P2P] External address saved to backend');
          return refreshUser();
        })
        .then(() => {
          console.log('[P2P] User refreshed with new wallet');
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
  }, [walletMode, isConnected, address, savingAddress, walletChosen]);

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

  if (loading || (walletChosen && !user)) {
    return (
      <div className="loading-screen">
        <div className="logo">P2PFather</div>
        <div className="spinner spinner-lg" />
        <span className="text-xs text-muted">Initializing...</span>
      </div>
    );
  }

  // Show connecting state while saving external wallet
  if (connecting) {
    return (
      <div className="loading-screen">
        <div className="logo">P2PFather</div>
        <div className="spinner spinner-lg" />
        <span className="text-xs text-muted">Connecting wallet...</span>
      </div>
    );
  }

  // Show wallet selector for NEW users only (no wallet in DB)
  if (!walletChosen) {
    return (
      <WalletSelector
        onSelectBot={() => {
          setConnecting(true);
          api.wallet.connectBot()
            .then(() => refreshUser())
            .then(() => {
              setWalletMode('bot');
              setWalletChosen(true);
              setConnecting(false);
            })
            .catch(err => {
              console.error(err);
              setConnecting(false);
            });
        }}
        onSelectExternal={async () => {
          setWalletMode('external');
          console.log('[P2P] Opening WalletConnect modal...');
          // Open Reown/WalletConnect modal
          // walletChosen will be set by the useEffect above after address is saved
          await appKit.open();

          // Fallback: if wagmi already connected (persisted session), trigger save
          // Small delay to let wagmi state update
          setTimeout(() => {
            console.log('[P2P] After modal open, wagmi state:', { isConnected, address });
          }, 1000);
        }}
      />
    );
  }

  const handleSwitchWallet = async () => {
    // Disconnect wagmi if connected
    if (isConnected) {
      await appKit.disconnect();
    }
    setWalletMode(null);
    setWalletChosen(false);
    // Optionally clear from DB or just let them switch (we might want to keep the DB record until they pick a new one, but for UI switching, local state reset is enough)
  };

  return (
    <>
      <DeepLinkHandler />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home user={user} />} />
          <Route path="orders" element={<Orders user={user} />} />
          <Route path="create" element={<CreateOrder />} />
          <Route path="trade/:id" element={<TradeDetail user={user} />} />
          <Route path="trade/new/:orderId" element={<TradeDetail user={user} />} />
          <Route path="wallet" element={<Wallet user={user} />} />

          <Route path="ads" element={<MyAds />} />
          <Route path="admin" element={<Admin />} />
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
            <BrowserRouter basename="/app2">
              <AppInner />
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default App;
