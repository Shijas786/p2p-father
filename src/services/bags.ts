import axios from "axios";
import { env } from "../config/env";

export interface BagsPoolState {
    price: number;
    mcap: number;
    reserves_token: number;
    reserves_sol: number;
    liquidity: number;
}

export interface BagsStats {
    price: number;
    mcap: number;
    volume_24h_estimate?: number;
    lifetime_fees: number;
}

export class BagsService {
    private readonly baseUrl = "https://public-api-v2.bags.fm/api/v1";
    private readonly apiKey: string;

    constructor() {
        this.apiKey = env.BAGS_API_KEY;
    }

    private get headers() {
        return {
            "x-api-key": this.apiKey,
        };
    }

    /**
     * Fetches the current state of a Bags pool (Price, MCAP, etc.)
     */
    async getPoolState(mint: string): Promise<BagsPoolState | null> {
        try {
            if (!this.apiKey || !mint || mint === "REPLACE_WITH_SOLANA_MINT_ADDRESS") {
                return null;
            }

            // Corrected Path: /solana/bags/pools/:mint
            const response = await axios.get(`${this.baseUrl}/solana/bags/pools/${mint}`, {
                headers: this.headers,
            });

            const data = response.data;
            return {
                price: parseFloat(data.price || "0"),
                mcap: parseFloat(data.mcap || "0"),
                reserves_token: parseFloat(data.reserves_token || "0"),
                reserves_sol: parseFloat(data.reserves_sol || "0"),
                liquidity: parseFloat(data.liquidity || "0"),
            };
        } catch (error: any) {
            console.error(`[BagsService] Error fetching pool state for ${mint}:`, error.message);
            return null;
        }
    }

    /**
     * Fetches lifetime fees as a proxy for total trading volume
     */
    async getLifetimeFees(mint: string): Promise<number> {
        try {
            if (!this.apiKey || !mint || mint === "REPLACE_WITH_SOLANA_MINT_ADDRESS") {
                return 0;
            }

            // Corrected Path: /token-launch/lifetime-fees
            const response = await axios.get(`${this.baseUrl}/token-launch/lifetime-fees`, {
                headers: this.headers,
                params: { mint },
            });

            return parseFloat(response.data.total_fees || "0");
        } catch (error: any) {
            console.error(`[BagsService] Error fetching lifetime fees for ${mint}:`, error.message);
            return 0;
        }
    }

    /**
     * Helper to get consolidated stats for the dashboard
     */
    async getConsolidatedStats(mint: string): Promise<BagsStats | null> {
        const [pool, fees] = await Promise.all([
            this.getPoolState(mint),
            this.getLifetimeFees(mint),
        ]);

        if (!pool) return null;

        return {
            price: pool.price,
            mcap: pool.mcap,
            lifetime_fees: fees,
        };
    }
}

export const bags = new BagsService();
