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
        
        // Forward all other requests to a public RPC
        const rpcUrls: Record<number, string> = {
          1: 'https://eth.llamarpc.com',
          56: 'https://bsc-dataseed.binance.org',
          137: 'https://polygon-rpc.com',
          42161: 'https://arb1.arbitrum.io/rpc',
          10: 'https://mainnet.optimism.io',
          43114: 'https://api.avax.network/ext/bc/C/rpc',
          59144: 'https://rpc.linea.build',
          534352: 'https://rpc.scroll.io',
          8453: 'https://mainnet.base.org'
        };
        const rpcUrl = rpcUrls[currentChainId] || 'https://mainnet.base.org';
        
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method,
                    params
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.result;
        } catch (e: any) {
            console.error("[HotWallet] RPC fallback error", e);
            throw e;
        }
      }
    };

    return {
      id: 'hotWallet',
      name: 'P2PFather Hot Wallet',
      type: 'hotWallet',
      async connect({ chainId } = {}) {
        if (chainId) currentChainId = chainId;
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        
        config.emitter.emit('connect', { accounts: accounts.map(getAddress), chainId: currentChainId });
        
        return { accounts: accounts.map(getAddress), chainId: currentChainId };
      },
      async disconnect() {
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
        return true;
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
