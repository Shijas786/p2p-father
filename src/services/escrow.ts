import { ethers } from "ethers";
import { env } from "../config/env";

// Minimal ERC20 ABI for USDC interactions
const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
];

// P2PEscrow contract ABI (key functions only)
const ESCROW_ABI = [
    // Trade functions
    "function createTrade(address buyer, address token, uint256 amount, uint256 duration) returns (uint256)",
    "function createTradeByRelayer(address seller, address buyer, address token, uint256 amount, uint256 duration) returns (uint256)",
    "function deposit(address token, uint256 amount)",
    "function withdraw(address token, uint256 amount)",
    "function markFiatSent(uint256 tradeId)",
    "function release(uint256 tradeId)",
    "function refund(uint256 tradeId)",
    "function raiseDispute(uint256 tradeId, string reason)",
    "function resolveDispute(uint256 tradeId, bool releaseToBuyer)",

    // View functions
    "function getTrade(uint256 tradeId) view returns (tuple(address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, address disputeInitiator, string disputeReason))",
    "function tradeCounter() view returns (uint256)",
    "function calculateFee(uint256 amount) view returns (uint256 fee, uint256 netAmount)",
    "function isExpired(uint256 tradeId) view returns (bool)",
    "function getContractBalance(address token) view returns (uint256)",
    "function feeBps() view returns (uint256)",
    "function feeCollector() view returns (address)",
    "function approvedTokens(address) view returns (bool)",
    "function balances(address user, address token) view returns (uint256)",
    "function totalFeesCollected(address) view returns (uint256)",
    "function activeTradeCount(address) view returns (uint256)",
    "function maxActiveTradesPerUser() view returns (uint256)",

    // Admin functions
    "function setFeeBps(uint256 newFeeBps)",
    "function setApprovedToken(address token, bool approved)",
    "function setRelayer(address relayer, bool approved)",
    "function setFeeCollector(address newCollector)",
    "function setMaxActiveTrades(uint256 max)",
    "function emergencyWithdraw(address token, uint256 amount)",

    // Events
    "event Deposit(address indexed user, address indexed token, uint256 amount)",
    "event Withdraw(address indexed user, address indexed token, uint256 amount)",
    "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)",
    "event FiatMarkedSent(uint256 indexed tradeId, address indexed buyer, uint256 autoReleaseDeadline)",
    "event AutoReleased(uint256 indexed tradeId, address indexed buyer, uint256 buyerReceives, uint256 feeAmount)",
    "event TradeReleased(uint256 indexed tradeId, address indexed buyer, uint256 buyerReceives, uint256 feeAmount)",
    "event TradeRefunded(uint256 indexed tradeId, address indexed seller, uint256 amount)",
    "event TradeCancelled(uint256 indexed tradeId, address indexed seller)",
    "event TradeDisputed(uint256 indexed tradeId, address indexed initiator, string reason)",
    "event DisputeResolved(uint256 indexed tradeId, address indexed resolver, bool releasedToBuyer)",
    "event FeeUpdated(uint256 oldFee, uint256 newFee)",
    "event TokenApproved(address token, bool approved)",
    "event RelayerUpdated(address relayer, bool approved)",
    "event FeeCollectorUpdated(address oldCollector, address newCollector)",
];

type Chain = 'base' | 'bsc';

class EscrowService {
    private providers: Record<string, ethers.JsonRpcProvider | null> = {
        base: null,
        bsc: null
    };
    private relayers: Record<string, ethers.Wallet | null> = {
        base: null,
        bsc: null
    };

    private getProvider(chain: Chain = 'base'): ethers.JsonRpcProvider {
        if (!this.providers[chain]) {
            const url = chain === 'base' ? env.BASE_RPC_URL : env.BSC_RPC_URL;
            this.providers[chain] = new ethers.JsonRpcProvider(url);
        }
        return this.providers[chain]!;
    }

    private getRelayer(chain: Chain = 'base'): ethers.Wallet {
        if (!this.relayers[chain]) {
            if (!env.RELAYER_PRIVATE_KEY) {
                throw new Error("Relayer private key not configured");
            }
            this.relayers[chain] = new ethers.Wallet(env.RELAYER_PRIVATE_KEY, this.getProvider(chain));
        }
        return this.relayers[chain]!;
    }

    private getContractAddress(chain: Chain, legacy: boolean = false): string {
        if (legacy) {
            return chain === 'base' ? (env as any).ESCROW_CONTRACT_ADDRESS_LEGACY : (env as any).ESCROW_CONTRACT_ADDRESS_BSC_LEGACY;
        }
        return chain === 'base' ? env.ESCROW_CONTRACT_ADDRESS : env.ESCROW_CONTRACT_ADDRESS_BSC;
    }

    private getEscrowContract(chain: Chain = 'base', legacy: boolean = false): ethers.Contract {
        const address = this.getContractAddress(chain, legacy);
        if (!address) throw new Error(`Escrow contract address not configured for ${chain}${legacy ? ' (legacy)' : ''}`);

        return new ethers.Contract(address, ESCROW_ABI, this.getRelayer(chain));
    }

    // ═══════════════════════════════════════
    //          VAULT & RELAYER FUNCTIONS
    // ═══════════════════════════════════════

    async getVaultBalance(userAddress: string, tokenAddress: string, chain: Chain = 'base', legacy: boolean = false): Promise<string> {
        try {
            const contract = this.getEscrowContract(chain, legacy);
            const balance: bigint = await contract.balances(userAddress, tokenAddress);

            let decimals = 18;
            if (chain === 'base' && (tokenAddress === env.USDC_ADDRESS || tokenAddress === env.USDT_ADDRESS)) {
                decimals = 6;
            }

            return ethers.formatUnits(balance, decimals);
        } catch (err) {
            console.error(`[ESCROW] Failed to get ${legacy ? 'legacy ' : ''}vault balance on ${chain}:`, err);
            return "0";
        }
    }

    /**
     * Relayer starts a trade (locks funds) for a match found in DB
     */
    async createRelayedTrade(
        seller: string,
        buyer: string,
        token: string,
        amount: string,
        duration: number,
        chain: Chain = 'base'
    ): Promise<string> {
        const contract = this.getEscrowContract(chain);

        let decimals = 18;
        if (chain === 'base' && (token === env.USDC_ADDRESS || token === env.USDT_ADDRESS)) {
            decimals = 6;
        }

        const amountUnits = ethers.parseUnits(amount, decimals);

        console.log(`[ESCROW] Relayer creating trade on ${chain}...`);
        const tx = await contract.createTradeByRelayer(
            seller,
            buyer,
            token,
            amountUnits,
            duration
        );

        const receipt = await tx.wait();

        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (parsed && parsed.name === "TradeCreated") {
                    const tradeId = parsed.args.tradeId.toString();
                    console.log(`[ESCROW] Trade created on-chain! ID: ${tradeId}`);
                    return tradeId;
                }
            } catch (e) {
                // ignore
            }
        }

        throw new Error("TradeCreated event not found in receipt");
    }

    /**
     * Release funds to buyer (called by Relayer when Seller confirms)
     */
    async release(tradeId: string | number, chain: Chain = 'base'): Promise<string> {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const contract = this.getEscrowContract(chain);
                console.log(`[ESCROW] Releasing trade ${tradeId} on ${chain} (Attempt ${attempts})...`);
                const tx = await contract.release(tradeId);
                await tx.wait();
                console.log(`[ESCROW] Released: ${tx.hash}`);
                return tx.hash;
            } catch (err: any) {
                console.error(`[ESCROW] Release attempt ${attempts} failed:`, err.message);
                if (attempts >= maxAttempts) throw err;
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
        throw new Error("Release failed after max retries");
    }

    /**
     * Refund funds to seller (called by Relayer if timeout or Seller cancels)
     */
    async refund(tradeId: string | number, chain: Chain = 'base'): Promise<string> {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const contract = this.getEscrowContract(chain);
                console.log(`[ESCROW] Refunding trade ${tradeId} on ${chain} (Attempt ${attempts})...`);
                const tx = await contract.refund(tradeId);
                await tx.wait();
                console.log(`[ESCROW] Refunded: ${tx.hash}`);
                return tx.hash;
            } catch (err: any) {
                console.error(`[ESCROW] Refund attempt ${attempts} failed:`, err.message);
                if (attempts >= maxAttempts) throw err;
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
        throw new Error("Refund failed after max retries");
    }

    /**
     * Batch validate seller balances for a list of orders.
     * Returns a Set of Order IDs that are invalid (insufficient balance).
     */
    async validateSellerBalances(orders: any[]): Promise<Set<string>> {
        const invalidOrderIds = new Set<string>();

        // Group by chain to parallelize efficiently? 
        // For now, just map all to promises.

        await Promise.all(orders.map(async (order) => {
            if (!order.wallet_address || order.type !== 'sell') return;

            try {
                let tokenAddress = "";
                if (order.chain === 'bsc') {
                    tokenAddress = (order.token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
                } else {
                    tokenAddress = (order.token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
                }

                const balanceStr = await this.getVaultBalance(order.wallet_address, tokenAddress, order.chain);
                const balance = parseFloat(balanceStr);

                // This check is simplistic (order vs total balance). 
                // Ideally we should sum up all orders for a user and compare vs balance.
                // But for "ghost ad" detection, if balance < order.amount, it's definitely invalid.

                if (balance < order.amount) {
                    invalidOrderIds.add(order.id);
                }
            } catch (err) {
                console.error(`[ESCROW] Failed to validate order ${order.id}:`, err);
                // If we can't check, we usually default to safe? or risky? 
                // Let's assume safe for network errors, but maybe invalidIds is safer if we want strictness.
                // For now, let's not block on RPC errors to avoid downtime.
            }
        }));

        return invalidOrderIds;
    }
}

export const escrow = new EscrowService();
