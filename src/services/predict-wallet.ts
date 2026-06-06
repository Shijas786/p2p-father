import { RelayClient } from "@polymarket/builder-relayer-client";
import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wallet as walletService } from "./wallet";
import { bridge as bridgeService } from "./bridge";
import { env } from "../config/env";
import { DepositWalletCall } from "@polymarket/builder-relayer-client";

export class PredictWalletService {
    private isDemoMode = false;

    constructor() {
        const hasCredentials = (env as any).POLYMARKET_PRIVATE_KEY && 
                               (env as any).POLYMARKET_BUILDER_API_KEY && 
                               (env as any).POLYMARKET_BUILDER_SECRET && 
                               (env as any).POLYMARKET_BUILDER_PASSPHRASE;

        if (!hasCredentials) {
            this.isDemoMode = true;
        }
    }

    private getUserRelayClient(userWalletIndex: number): RelayClient | null {
        if (this.isDemoMode) return null;
        try {
            const derived = walletService.deriveWallet(userWalletIndex);
            const account = privateKeyToAccount(derived.privateKey as `0x${string}`);
            const wallet = createWalletClient({
                account,
                transport: http(process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com")
            });

            const creds = {
                apiKey: (env as any).POLYMARKET_BUILDER_API_KEY || "",
                apiSecret: (env as any).POLYMARKET_BUILDER_SECRET || "",
                passphrase: (env as any).POLYMARKET_BUILDER_PASSPHRASE || ""
            };

            return new RelayClient(
                "https://relayer.polymarket.com",
                137,
                wallet,
                creds as any
            );
        } catch (e) {
            console.error("Failed to create RelayClient:", e);
            return null;
        }
    }

    /**
     * Get the Smart Routing Address (Deposit Wallet) for cross-chain deposits
     */
    async getDepositAddress(userWalletIndex: number): Promise<string> {
        if (this.isDemoMode) {
            return walletService.deriveWallet(userWalletIndex).address;
        }
        
        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Failed to construct relayer client");
        
        return await client.deriveDepositWalletAddress();
    }

    /**
     * Deploys the deposit wallet if it hasn't been deployed yet.
     */
    async deployDepositWalletIfNeeded(userWalletIndex: number): Promise<boolean> {
        if (this.isDemoMode) return true;
        
        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Failed to construct relayer client");

        const depositAddress = await client.deriveDepositWalletAddress();
        const isDeployed = await client.getDeployed(depositAddress);

        if (!isDeployed) {
            console.log(`[PredictWallet] Deploying Deposit Wallet proxy for ${depositAddress}`);
            const response = await client.deployDepositWallet();
            await response.wait();
            return true;
        }

        return true;
    }

    /**
     * Executes a cross-chain smart routing action (e.g. bridging USDC on Arbitrum to Polygon USDC.e)
     */
    async routeDeposit(
        userWalletIndex: number, 
        fromTokenAddress: string, 
        toTokenAddress: string, 
        amount: string
    ): Promise<string> {
        if (this.isDemoMode) return "0x_simulated_bridge_tx";

        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Failed to construct relayer client");

        const depositWallet = await client.deriveDepositWalletAddress();

        // Ensure the proxy is deployed first
        await this.deployDepositWalletIfNeeded(userWalletIndex);

        // Fetch bridge routing call data using LI.FI (our bridge.ts service)
        // Note: LI.FI provides the exact `data` and `to` target for execution.
        const quote = await bridgeService.getQuote({
            fromChainId: 137, // Assuming funds landed on Polygon
            toChainId: 137,   // Staying on Polygon for Polymarket
            fromTokenAddress,
            toTokenAddress,
            fromAmount: amount,
            fromAddress: depositWallet,
        });

        const routeCall: DepositWalletCall = {
            target: quote.transactionRequest.to,
            value: quote.transactionRequest.value || "0",
            data: quote.transactionRequest.data
        };

        const deadline = Math.floor(Date.now() / 1000 + 3600).toString();

        console.log(`[PredictWallet] Executing batch route on Deposit Wallet: ${depositWallet}`);
        const response = await client.executeDepositWalletBatch([routeCall], depositWallet, deadline);
        const result = await response.wait();
        
        return result?.transactionHash || response.transactionHash || response.hash;
    }
}

export const predictWalletService = new PredictWalletService();
