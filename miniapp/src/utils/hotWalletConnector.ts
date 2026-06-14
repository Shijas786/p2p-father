import { createConnector } from 'wagmi';
import { getAddress, createPublicClient, http } from 'viem';
import { base, bsc } from 'viem/chains';
import { api } from '../lib/api';

export function hotWalletConnector() {
  return createConnector((config) => {
    const baseClient = createPublicClient({ chain: base, transport: http() });
    
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
          return [addr];
        }
        if (method === 'eth_chainId') {
          return `0x${currentChainId.toString(16)}`;
        }
        if (method === 'wallet_switchEthereumChain') {
          const chainIdHex = params[0].chainId;
          currentChainId = parseInt(chainIdHex, 16);
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
            data: tx.data,
            value: tx.value ? BigInt(tx.value).toString() : "0",
            chainId
          });
          
          return res.txHash;
        }
        
        // Forward all other requests to a public RPC
        const rpcUrl = currentChainId === 56 ? 'https://bsc-dataseed.binance.org' : 'https://mainnet.base.org';
        
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
        return { accounts: accounts.map(getAddress), chainId: currentChainId };
      },
      async disconnect() {},
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
