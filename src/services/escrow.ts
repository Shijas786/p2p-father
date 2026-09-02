import { ethers } from "ethers";
import { env } from "../config/env";
import { getFastProvider } from "../utils/provider";

// Minimal ERC20 ABI for USDC interactions
const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
];

// Sentinel for native BNB/ETH — matches contract's NATIVE_TOKEN = address(0)
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

// P2PEscrow contract ABI (key functions only)
const ESCROW_ABI = [
    // Trade functions
    // NOTE: createTrade and deposit are payable — send msg.value for native BNB (token = address(0))
    "function createTrade(address buyer, address token, uint256 amount, uint256 duration) payable returns (uint256)",
    "function createTradeByRelayer(address seller, address buyer, address token, uint256 amount, uint256 duration) returns (uint256)",
    "function deposit(address token, uint256 amount) payable",
    "function withdraw(address token, uint256 amount)",
    "function markFiatSent(uint256 tradeId)",
    "function release(uint256 tradeId)",
    "function refund(uint256 tradeId)",
    "function raiseDispute(uint256 tradeId, string reason)",
    "function resolveDispute(uint256 tradeId, bool releaseToBuyer)",

    // View functions
    "function getTrade(uint256 tradeId) view returns (tuple(address seller, uint8 status, uint32 createdAt, uint32 deadline, address buyer, uint32 fiatSentAt, address token, address disputeInitiator, uint256 amount, uint256 feeAmount, uint256 buyerReceives))",
    "function NATIVE_TOKEN() view returns (address)",
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
    "event FiatMarkedSent(uint256 indexed tradeId, address indexed buyer)",
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

type Chain = 'base' | 'bsc' | 'bsc_testnet' | 'base_sepolia';

// Base Builder Code ERC-8021 Suffix for on-chain attribution
const BASE_BUILDER_SUFFIX = "62635f39766479347879770b0080218021802180218021802180218021";

export class EscrowService {
    /**
     * Helper to encode contract calls and append the Base Builder Code suffix on Base network
     */
    private async sendContractTx(contract: ethers.Contract, fnName: string, args: any[], chain: Chain, txOptions: any = {}) {
        let data = contract.interface.encodeFunctionData(fnName, args);
        if (chain === 'base') {
            data = data + BASE_BUILDER_SUFFIX;
        }
        const runner = contract.runner as ethers.Signer;
        return await runner.sendTransaction({
            to: contract.target,
            data,
            ...txOptions
        });
    }
    private providers: Record<string, ethers.Provider | null> = {};
    private relayers: Record<string, ethers.Wallet | null> = {};

    private getProvider(chain: Chain = 'base', rpcIndex: number = 0): ethers.Provider {
        return getFastProvider(chain, rpcIndex);
    }

    private getRelayer(chain: Chain = 'base', rpcIndex: number = 0): ethers.Wallet {
        if (!env.RELAYER_PRIVATE_KEY) {
            throw new Error("Relayer private key not configured");
        }
        return new ethers.Wallet(env.RELAYER_PRIVATE_KEY, this.getProvider(chain, rpcIndex));
    }

    private getContractAddress(chain: Chain = 'base'): string {
        if (chain === 'bsc_testnet') return process.env.ESCROW_CONTRACT_ADDRESS_BSC_TESTNET || "0x5ED1dC490061Bf9e281B849B6D4ed17feE84F260";
        if (chain === 'base_sepolia') return process.env.ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA || "0xf20872C359788a53958a048413D64F183403B1f1";
        return chain === 'base' ? env.ESCROW_CONTRACT_ADDRESS : env.ESCROW_CONTRACT_ADDRESS_BSC;
    }

    private getEscrowContract(chain: Chain = 'base', rpcIndex: number = 0): ethers.Contract {
        const address = this.getContractAddress(chain);
        return new ethers.Contract(address, ESCROW_ABI, this.getRelayer(chain, rpcIndex));
    }

    // ═══════════════════════════════════════
    //          VAULT & RELAYER FUNCTIONS
    // ═══════════════════════════════════════

    /**
     * Resolves the exact ERC20 token address for a trade on a given chain.
     * On BSC Testnet, checks which testnet USDT token address (new 0x3376... or legacy 0x21d4...)
     * contains the seller's vault balance.
     */
    async resolveTokenAddressForTrade(
        sellerAddress: string,
        tokenSymbol: string,
        amount: number,
        chain: Chain = 'base'
    ): Promise<string> {
        if (chain === ('bsc_testnet' as any)) {
            const t1 = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
            const t2 = "0x21d4945A5499107F19F819dA1ab9133902A58EAB";
            try {
                const contract = this.getEscrowContract('bsc_testnet' as any);
                const reqWei = ethers.parseUnits(amount.toString(), 18);

                const [b1, b2] = await Promise.all([
                    (contract.balances(sellerAddress, t1) as Promise<bigint>).catch(() => 0n),
                    (contract.balances(sellerAddress, t2) as Promise<bigint>).catch(() => 0n)
                ]);

                if (b1 >= reqWei) return t1;
                if (b2 >= reqWei) return t2;
                if (b1 > 0n || b2 > 0n) return b1 >= b2 ? t1 : t2;
            } catch (err) {
                console.error("[ESCROW] Error resolving testnet token address:", err);
            }
            return t1;
        }

        if (chain === 'bsc') {
            if (tokenSymbol === 'BNB') return "0x0000000000000000000000000000000000000000";
            return tokenSymbol === "USDT" ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
        }

        return tokenSymbol === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS;
    }

    async getVaultBalance(userAddress: string, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const maxAttempts = 3;
        let lastErr: any;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const contract = this.getEscrowContract(chain, attempt);

                if (chain === ('bsc_testnet' as any) && (!tokenAddress || tokenAddress === "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd")) {
                    const [b1, b2] = await Promise.all([
                        (contract.balances(userAddress, "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd") as Promise<bigint>).catch(() => 0n),
                        (contract.balances(userAddress, "0x21d4945A5499107F19F819dA1ab9133902A58EAB") as Promise<bigint>).catch(() => 0n)
                    ]);
                    const maxB = b1 > b2 ? b1 : b2;
                    return ethers.formatUnits(maxB, 18);
                }

                // 3.5s timeout wrapper per RPC read
                const balancePromise = contract.balances(userAddress, tokenAddress) as Promise<bigint>;
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("RPC read timeout")), 3500)
                );

                const balance: bigint = await Promise.race([balancePromise, timeoutPromise]);

                let decimals = 18;
                if (chain === 'base' && (tokenAddress === env.USDC_ADDRESS || tokenAddress === env.USDT_ADDRESS)) {
                    decimals = 6;
                } else if (chain === 'bsc' && tokenAddress !== "0x0000000000000000000000000000000000000000") {
                    decimals = 18;
                }

                return ethers.formatUnits(balance, decimals);
            } catch (err: any) {
                lastErr = err;
                console.warn(`[ESCROW] Failed to get vault balance on ${chain} (Attempt ${attempt + 1}/${maxAttempts}):`, err?.message || err);
            }
        }
        throw lastErr;
    }

    /**
     * Submit a relayed trade tx and return txHash IMMEDIATELY (no block wait).
     * Use this for the HTTP request path so the client never times out.
     * Call confirmRelayedTrade(txHash, chain) in the background to get the on-chain tradeId.
     */
    async submitRelayedTrade(
        seller: string,
        buyer: string,
        token: string,
        amount: string,
        duration: number,
        chain: Chain = 'base'
    ): Promise<{ txHash: string; contract: ethers.Contract }> {
        let decimals = 18;
        if (chain === 'base' && (token === env.USDC_ADDRESS || token === env.USDT_ADDRESS)) {
            decimals = 6;
        }

        const amountUnits = ethers.parseUnits(amount, decimals);
        const maxAttempts = 3;
        let lastErr: any;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const contract = this.getEscrowContract(chain, attempt);

                const txOptions: any = {};
                if (chain === 'bsc') {
                    txOptions.gasPrice = ethers.parseUnits("0.06", "gwei");
                    txOptions.gasLimit = 500000;
                }

                console.log(`[ESCROW] Submitting createTradeByRelayer on ${chain} (Attempt ${attempt + 1}/${maxAttempts})...`);
                const tx = await this.sendContractTx(
                    contract,
                    "createTradeByRelayer",
                    [seller, buyer, token, amountUnits, duration],
                    chain,
                    txOptions
                );

                console.log(`[ESCROW] Trade tx submitted on ${chain}: ${tx.hash}`);
                // Return immediately — do NOT await tx.wait() here
                return { txHash: tx.hash, contract };
            } catch (err: any) {
                lastErr = err;
                console.error(`[ESCROW] submitRelayedTrade attempt ${attempt + 1} failed:`, err?.message || err);
                if (attempt < maxAttempts - 1) {
                    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
                }
            }
        }

        throw lastErr || new Error("Failed to submit relayed trade after multiple RPC attempts");
    }

    /**
     * Wait for a previously submitted tx to be mined and extract the on-chain tradeId.
     * Call this in a background process AFTER responding to the client.
     */
    async confirmRelayedTrade(
        txHash: string,
        chain: Chain = 'base'
    ): Promise<string> {
        const maxAttempts = 3;
        let lastErr: any;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const contract = this.getEscrowContract(chain, attempt);
                const provider = this.getProvider(chain, attempt);

                console.log(`[ESCROW] Waiting for tx confirmation on ${chain}: ${txHash} (Attempt ${attempt + 1})...`);
                const receipt = await provider.waitForTransaction(txHash, 1, 60000); // 60s timeout

                if (!receipt) throw new Error("Transaction receipt not found");

                for (const log of receipt.logs) {
                    try {
                        const parsed = contract.interface.parseLog(log);
                        if (parsed && parsed.name === "TradeCreated") {
                            const tradeId = parsed.args.tradeId.toString();
                            console.log(`[ESCROW] Trade confirmed on-chain! ID: ${tradeId}, TxHash: ${txHash}`);
                            return tradeId;
                        }
                    } catch (e) {
                        // ignore log parse error
                    }
                }

                throw new Error("TradeCreated event not found in receipt");
            } catch (err: any) {
                lastErr = err;
                console.error(`[ESCROW] confirmRelayedTrade attempt ${attempt + 1} failed:`, err?.message || err);
                if (attempt < maxAttempts - 1) {
                    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                }
            }
        }

        throw lastErr || new Error("Failed to confirm relayed trade after multiple RPC attempts");
    }

    /**
     * Legacy blocking version — kept for admin/manual use only.
     * DO NOT use in HTTP request handlers (will cause client timeout).
     */
    async createRelayedTrade(
        seller: string,
        buyer: string,
        token: string,
        amount: string,
        duration: number,
        chain: Chain = 'base'
    ): Promise<string> {
        const { txHash } = await this.submitRelayedTrade(seller, buyer, token, amount, duration, chain);
        return this.confirmRelayedTrade(txHash, chain);
    }

    /**
     * Get on-chain trade status (0: None, 1: Active, 2: FiatSent, 3: Disputed, 4: Completed, 5: Refunded, 6: Cancelled)
     */
    async getOnChainTradeStatus(tradeId: string | number, chain: Chain = 'base'): Promise<number | null> {
        try {
            const contract = this.getEscrowContract(chain, 0);
            const onChainTrade = await contract.getTrade(tradeId);
            return Number(onChainTrade.status ?? onChainTrade[1]);
        } catch (err: any) {
            console.error(`[ESCROW] Failed to fetch on-chain trade ${tradeId} status on ${chain}:`, err.message);
            return null;
        }
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
                const contract = this.getEscrowContract(chain, attempts - 1);
                if (!contract) throw new Error(`Escrow contract not configured for ${chain}`);
                console.log(`[ESCROW] Releasing trade ${tradeId} on ${chain} (Attempt ${attempts})...`);

                const txOptions: any = {};
                if (chain === 'bsc') {
                    txOptions.gasPrice = ethers.parseUnits("0.06", "gwei");
                }

                const tx = await this.sendContractTx(contract, "release", [tradeId], chain, txOptions);
                await tx.wait();
                console.log(`[ESCROW] Released: ${tx.hash}`);
                return tx.hash;
            } catch (err: any) {
                console.error(`[ESCROW] Release attempt ${attempts} failed:`, err.message);

                // If transaction reverted, verify if trade was already completed on-chain (idempotency guard)
                if (err.message && (err.message.includes("Trade not in releasable state") || err.message.includes("execution reverted"))) {
                    try {
                        const status = await this.getOnChainTradeStatus(tradeId, chain);
                        // Status 4 is TradeStatus.Completed
                        if (status === 4) {
                            console.log(`[ESCROW] Trade ${tradeId} is ALREADY Completed on ${chain}. Treating release as success.`);
                            return "already_released";
                        }
                    } catch (checkErr: any) {
                        console.error(`[ESCROW] Failed to verify on-chain status on revert for trade ${tradeId}:`, checkErr.message);
                    }
                }

                if (attempts >= maxAttempts) throw err;
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
        throw new Error("Release failed after max retries");
    }

    /**
     * Mark trade as paid on-chain (called when Buyer confirms fiat payment)
     */
    async markFiatSent(tradeId: string | number, chain: Chain = 'base'): Promise<string> {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const contract = this.getEscrowContract(chain, attempts - 1);
                if (!contract) throw new Error(`Escrow contract not configured for ${chain}`);
                console.log(`[ESCROW] Marking trade ${tradeId} as paid on-chain (${chain}) (Attempt ${attempts})...`);

                const txOptions: any = {};
                if (chain === 'bsc') {
                    txOptions.gasPrice = ethers.parseUnits("0.06", "gwei");
                }

                const tx = await this.sendContractTx(contract, "markFiatSent", [tradeId], chain, txOptions);
                await tx.wait();
                console.log(`[ESCROW] Marked paid on-chain: ${tx.hash}`);
                return tx.hash;
            } catch (err: any) {
                console.error(`[ESCROW] Mark paid attempt ${attempts} failed:`, err.message);

                // If transaction reverted, verify if trade is already marked FiatSent or Completed
                if (err.message && (err.message.includes("Trade not active") || err.message.includes("execution reverted"))) {
                    try {
                        const status = await this.getOnChainTradeStatus(tradeId, chain);
                        // Status 2 is FiatSent, 4 is Completed
                        if (status === 2 || status === 4) {
                            console.log(`[ESCROW] Trade ${tradeId} is ALREADY FiatSent/Completed on ${chain}. Treating markFiatSent as success.`);
                            return "already_marked_paid";
                        }
                    } catch (checkErr: any) {
                        console.error(`[ESCROW] Failed to verify on-chain status for markFiatSent ${tradeId}:`, checkErr.message);
                    }
                }

                if (attempts >= maxAttempts) throw err;
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
        throw new Error("Mark fiat sent failed after max retries");
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
                const contract = this.getEscrowContract(chain, attempts - 1);
                if (!contract) throw new Error(`Escrow contract not configured for ${chain}`);
                console.log(`[ESCROW] Refunding trade ${tradeId} on ${chain} (Attempt ${attempts})...`);

                const txOptions: any = {};
                if (chain === 'bsc') {
                    txOptions.gasPrice = ethers.parseUnits("0.06", "gwei");
                }

                const tx = await this.sendContractTx(contract, "refund", [tradeId], chain, txOptions);
                await tx.wait();
                console.log(`[ESCROW] Refunded: ${tx.hash}`);
                return tx.hash;
            } catch (err: any) {
                console.error(`[ESCROW] Refund attempt ${attempts} failed:`, err.message);

                // If transaction reverted, verify if trade was already refunded or cancelled
                if (err.message && (err.message.includes("Trade not in refundable state") || err.message.includes("execution reverted"))) {
                    try {
                        const status = await this.getOnChainTradeStatus(tradeId, chain);
                        // Status 5 is Refunded, 6 is Cancelled
                        if (status === 5 || status === 6) {
                            console.log(`[ESCROW] Trade ${tradeId} is ALREADY Refunded/Cancelled on ${chain}. Treating refund as success.`);
                            return "already_refunded";
                        }
                    } catch (checkErr: any) {
                        console.error(`[ESCROW] Failed to verify on-chain status on revert for refund ${tradeId}:`, checkErr.message);
                    }
                }

                if (attempts >= maxAttempts) throw err;
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
        throw new Error("Refund failed after max retries");
    }

    /**
     * Raise a dispute on-chain
     */
    async raiseDispute(tradeId: string | number, reason: string, chain: Chain = 'base'): Promise<string> {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const contract = this.getEscrowContract(chain, attempts - 1);
                if (!contract) throw new Error(`Escrow contract not configured for ${chain}`);
                console.log(`[ESCROW] Raising dispute for trade ${tradeId} on ${chain} (Attempt ${attempts})...`);

                const txOptions: any = {};
                if (chain === 'bsc') {
                    txOptions.gasPrice = ethers.parseUnits("0.06", "gwei");
                }

                const tx = await this.sendContractTx(contract, "raiseDispute", [tradeId, reason], chain, txOptions);
                await tx.wait();
                console.log(`[ESCROW] Dispute raised: ${tx.hash}`);
                return tx.hash;
            } catch (err: any) {
                console.error(`[ESCROW] Dispute attempt ${attempts} failed:`, err.message);
                if (attempts >= maxAttempts) throw err;
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
        throw new Error("Raise dispute failed after max retries");
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
                    if (order.token === 'BNB') {
                        tokenAddress = "0x0000000000000000000000000000000000000000";
                    } else {
                        tokenAddress = (order.token === "USDT") ? "0x55d398326f99059fF775485246999027B3197955" : "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
                    }
                } else {
                    tokenAddress = (order.token === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
                }

                const balanceStr = await this.getVaultBalance(order.wallet_address, tokenAddress, order.chain);
                const balance = parseFloat(balanceStr);

                if (balance < order.amount) {
                    invalidOrderIds.add(order.id);
                }
            } catch (err) {
                console.error(`[ESCROW] Failed to validate order ${order.id}:`, err);
            }
        }));

        return invalidOrderIds;
    }

    /**
     * Get the balance of the relayer (ETH/BNB or ERC20)
     */
    async getRelayerBalance(tokenAddress?: string, chain: Chain = 'base'): Promise<string> {
        try {
            const relayer = this.getRelayer(chain);
            let balance: bigint;
            let decimals = 18;

            if (tokenAddress) {
                const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.getProvider(chain));
                balance = await contract.balanceOf(relayer.address);
                if (chain === 'base' && (tokenAddress === env.USDC_ADDRESS || tokenAddress === env.USDT_ADDRESS)) {
                    decimals = 6;
                }
            } else {
                balance = await this.getProvider(chain).getBalance(relayer.address);
            }

            return ethers.formatUnits(balance, decimals);
        } catch (err) {
            console.error(`[ESCROW] Failed to get relayer balance on ${chain}:`, err);
            return "0";
        }
    }

    /**
     * Get the total fees collected by the escrow contract
     */
    async getContractFees(tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        try {
            const contract = this.getEscrowContract(chain);
            const fees: bigint = await contract.totalFeesCollected(tokenAddress);
            let decimals = 18;
            if (chain === 'base' && (tokenAddress === env.USDC_ADDRESS || tokenAddress === env.USDT_ADDRESS)) {
                decimals = 6;
            }
            return ethers.formatUnits(fees, decimals);
        } catch (err) {
            console.error(`[ESCROW] Failed to get contract fees on ${chain}:`, err);
            return "0";
        }
    }
}

export const escrow = new EscrowService();
