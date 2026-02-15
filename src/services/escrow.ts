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
    "function autoRelease(uint256 tradeId)",
    "function raiseDispute(uint256 tradeId, string reason)",
    "function resolveDispute(uint256 tradeId, bool releaseToBuyer)",

    // View functions
    "function getTrade(uint256 tradeId) view returns (tuple(address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, uint256 autoReleaseDeadline, address disputeInitiator, string disputeReason))",
    "function tradeCounter() view returns (uint256)",
    "function calculateFee(uint256 amount) view returns (uint256 fee, uint256 netAmount)",
    "function isExpired(uint256 tradeId) view returns (bool)",
    "function getContractBalance(address token) view returns (uint256)",
    "function feeBps() view returns (uint256)",
    "function approvedTokens(address) view returns (bool)",
    "function balances(address user, address token) view returns (uint256)",
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

    private getContractAddress(chain: Chain): string {
        return chain === 'base' ? env.ESCROW_CONTRACT_ADDRESS : env.ESCROW_CONTRACT_ADDRESS_BSC;
    }

    private getEscrowContract(chain: Chain = 'base'): ethers.Contract {
        const address = this.getContractAddress(chain);
        if (!address) throw new Error(`Escrow contract address not configured for ${chain}`);

        return new ethers.Contract(address, ESCROW_ABI, this.getRelayer(chain));
    }

    // ═══════════════════════════════════════
    //          VAULT & RELAYER FUNCTIONS
    // ═══════════════════════════════════════

    async getVaultBalance(userAddress: string, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        try {
            const contract = this.getEscrowContract(chain);
            // Default to 6 decimals for USDC/USDT on Base, 18 elsewhere unless specified
            const balance: bigint = await contract.balances(userAddress, tokenAddress);

            let decimals = 18;
            if (chain === 'base' && (tokenAddress === env.USDC_ADDRESS || tokenAddress === env.USDT_ADDRESS)) {
                decimals = 6;
            }

            return ethers.formatUnits(balance, decimals);
        } catch (err) {
            console.error(`[ESCROW] Failed to get vault balance on ${chain}:`, err);
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
        const contract = this.getEscrowContract(chain);
        console.log(`[ESCROW] Releasing trade ${tradeId} on ${chain}...`);
        const tx = await contract.release(tradeId);
        await tx.wait();
        console.log(`[ESCROW] Released: ${tx.hash}`);
        return tx.hash;
    }

    /**
     * Refund funds to seller (called by Relayer if timeout or Seller cancels)
     */
    async refund(tradeId: string | number, chain: Chain = 'base'): Promise<string> {
        const contract = this.getEscrowContract(chain);
        console.log(`[ESCROW] Refunding trade ${tradeId} on ${chain}...`);
        const tx = await contract.refund(tradeId);
        await tx.wait();
        console.log(`[ESCROW] Refunded: ${tx.hash}`);
        return tx.hash;
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
