import { createConnector } from 'wagmi';
import { getAddress, numberToHex, SwitchChainError } from 'viem';
import { mainnet, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll } from 'viem/chains';
import { api } from '../lib/api';

const SUPPORTED_CHAINS = [mainnet, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll];

export function hotWalletConnector() {
  return createConnector((config) => {
    let currentChainId = 8453; // Default to base
    let botAddress: string | null = null;

    const getBotAddress = async () => {
      if (botAddress) return botAddress;
      const res = await api.wallet.getBalances();
      if (!res.address) throw new Error("Could not fetch bot address");
      botAddress = res.address;
      return botAddress;
    };

    const provider = {
      request: async ({ method, params }: any) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
          const addr = await getBotAddress();
          return [getAddress(addr)];
        }
        if (method === 'eth_chainId') {
          return numberToHex(currentChainId);
        }
        if (method === 'wallet_switchEthereumChain') {
          const chainIdHex = params[0].chainId;
          const newChainId = parseInt(chainIdHex, 16);
          const isSupported = SUPPORTED_CHAINS.some(c => c.id === newChainId);
          if (!isSupported) throw new SwitchChainError(new Error(`Chain ${newChainId} not supported`));
          currentChainId = newChainId;
          config.emitter.emit('change', { chainId: currentChainId });
          return null;
        }
        if (method === 'eth_sendTransaction') {
          const tx = params[0];
          
          let chainId = currentChainId;
          if (tx.chainId) {
              chainId = typeof tx.chainId === 'string' ? parseInt(tx.chainId, 16) : tx.chainId;
          }

          const res = await api.wallet.executeRawTransaction({
            to: tx.to,
            data: tx.data || '0x',
            value: tx.value ? BigInt(tx.value).toString() : "0",
            chainId
          });
          
          return res.txHash;
        }
        
        // Forward all other requests to multi-tier RPC with fallback:
        // Tier 1: New Alchemy -> Tier 2: Recent Alchemy -> Tier 3: Official public nodes
        const rpcListByChain: Record<number, string[]> = {
          1: [
            'https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://ethereum-rpc.publicnode.com'
          ],
          56: [
            'https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://bsc-dataseed.binance.org',
            'https://bsc.publicnode.com'
          ],
          137: [
            'https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://polygon.publicnode.com'
          ],
          42161: [
            'https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://arb1.arbitrum.io/rpc'
          ],
          10: [
            'https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://mainnet.optimism.io'
          ],
          43114: [
            'https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://api.avax.network/ext/bc/C/rpc'
          ],
          59144: [
            'https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://rpc.linea.build'
          ],
          534352: [
            'https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://rpc.scroll.io'
          ],
          8453: [
            'https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
            'https://mainnet.base.org',
            'https://base-rpc.publicnode.com'
          ]
        };

        const candidates = rpcListByChain[currentChainId] || [
          'https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER',
          'https://mainnet.base.org'
        ];

        let lastErr: any;
        for (const url of candidates) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method,
                params
              })
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status} from ${url}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.result;
          } catch (err) {
            lastErr = err;
            // Failover to next candidate in array
          }
        }
        console.error("[HotWallet] All candidate RPCs failed:", lastErr);
        throw lastErr;
      }
    };

    return {
      id: 'hotWallet',
      name: 'P2PFather Hot Wallet',
      type: 'hotWallet',
      icon: '/favicon.png',
      async connect({ chainId } = {}) {
        if (chainId) currentChainId = chainId;
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        
        config.emitter.emit('connect', { accounts: accounts.map(getAddress), chainId: currentChainId });
        
        return { accounts: accounts.map(getAddress), chainId: currentChainId };
      },
      async disconnect() {
        // Clear cached bot address so next connect fetches a fresh one
        botAddress = null;
        config.emitter.emit('disconnect');
      },
      async getAccounts() {
        const accounts = await provider.request({ method: 'eth_accounts' });
        return accounts.map(getAddress);
      },
      async getChainId() {
        return currentChainId;
      },
      async getProvider() {
        return provider;
      },
      async isAuthorized() {
        // Always return false — let App.tsx useEffect connect hotWallet
        // explicitly when walletMode === 'bot'. This prevents wagmi from
        // auto-reconnecting the hot wallet during external wallet sessions
        // (which caused the bot address to bleed into external wallet mode).
        return false;
      },
      async switchChain({ chainId }: { chainId: number }) {
        const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
        if (!chain) throw new SwitchChainError(new Error(`Chain ${chainId} not supported`));
        
        currentChainId = chainId;
        config.emitter.emit('change', { chainId });
        
        return chain;
      },
      onAccountsChanged(accounts) {
        if (accounts.length === 0) config.emitter.emit('disconnect');
        else config.emitter.emit('change', { accounts: accounts.map(getAddress) });
      },
      onChainChanged(chain) {
        currentChainId = Number(chain);
        config.emitter.emit('change', { chainId: currentChainId });
      },
      async onDisconnect() {
        config.emitter.emit('disconnect');
      },
    };
  });
}
