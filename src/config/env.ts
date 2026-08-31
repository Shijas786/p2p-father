import { ethers } from "ethers";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const addressSchema = z.string().transform((val) => {
    if (!val || val === "") return "";
    try {
        // Lowercase first to bypass ethers checksum check and force a new one
        return ethers.getAddress(val.toLowerCase());
    } catch (e) {
        console.warn(`[CONFIG] Invalid address format for: ${val}`);
        return val;
    }
});

const envSchema = z.object({
    // Telegram
    TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
    ADMIN_TELEGRAM_IDS: z.string().default(""),

    // OpenAI
    OPENAI_API_KEY: z.string().default(""),
    OPENAI_MODEL: z.string().default("gpt-5-nano"),
    GEMINI_API_KEY: z.string().default(""),

    // Supabase
    SUPABASE_URL: z.string().default(""),
    SUPABASE_ANON_KEY: z.string().default(""),
    SUPABASE_SERVICE_KEY: z.string().default(""),

    // Blockchain
    ESCROW_CONTRACT_ADDRESS: addressSchema.default(""),
    ESCROW_CONTRACT_ADDRESS_BSC: addressSchema.default(""),
    REWARD_CONTRACT_ADDRESS: addressSchema.default(""),
    ADMIN_WALLET_ADDRESS: addressSchema.default(""),
    RELAYER_PRIVATE_KEY: z.string().default(""),
    MASTER_WALLET_SEED: z.string().default(""),
    BASE_RPC_URL: z.string().default("https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    BSC_RPC_URL: z.string().default("https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    POLYGON_RPC_URL: z.string().default("https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    MAINNET_RPC_URL: z.string().default("https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    ARBITRUM_RPC_URL: z.string().default("https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    OPTIMISM_RPC_URL: z.string().default("https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    AVALANCHE_RPC_URL: z.string().default("https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    LINEA_RPC_URL: z.string().default("https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    SCROLL_RPC_URL: z.string().default("https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    USDC_ADDRESS: addressSchema.default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
    USDT_ADDRESS: addressSchema.default("0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"), // Axelar Wrapped USDT

    // WhatsApp
    WA_BOT_NUMBER: z.string().default("917012751478"),
    WA_ADMIN_SECRET: z.string().default(""),

    // Redis
    REDIS_URL: z.string().default(""),
    BROADCAST_CHANNEL_ID: z.string().optional(),

    // Base Developer & Builder Code
    BASE_DEV_API_KEY: z.string().default(""),
    BASE_BUILDER_CODE: z.string().default("bc_9vdy4xyw"),


    // App Config
    FEE_BPS: z.string().default("50"),
    DEFAULT_CHAIN: z.string().default("base"),
    DEFAULT_TOKEN: z.string().default("USDC"),
    ESCROW_TIMEOUT_SECONDS: z.string().default("1800"),
    AUTO_RELEASE_SECONDS: z.string().default("2700"),
    NODE_ENV: z.string().default("development"),
    COMMUNITY_CHAT_ID: z.string().default(""),
    COMMUNITY_INVITE_LINK: z.string().default("https://t.me/P2pFather0"),

    // Polymarket Builder
    POLYMARKET_PRIVATE_KEY: z.string().optional(),
    POLYMARKET_BUILDER_API_KEY: z.string().optional(),
    POLYMARKET_BUILDER_SECRET: z.string().optional(),
    POLYMARKET_BUILDER_PASSPHRASE: z.string().optional(),

    // Didit KYC
    DIDIT_API_KEY: z.string().default(""),
    DIDIT_WORKFLOW_ID: z.string().default(""),
    DIDIT_WEBHOOK_SECRET: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = {
    ...parsed.data,
    // Computed values
    ADMIN_IDS: parsed.data.ADMIN_TELEGRAM_IDS
        ? parsed.data.ADMIN_TELEGRAM_IDS.split(",").map(Number)
        : [],
    FEE_PERCENTAGE: parseInt(parsed.data.FEE_BPS) / 10000,
    IS_DEV: parsed.data.NODE_ENV === "development",
    IS_TESTNET: parsed.data.DEFAULT_CHAIN.includes("sepolia"),

    /**
     * Get the fee percentage for a specific chain.
     * New policy: 0% fee on Base chain.
     */
    getFeePercentage: (chain?: string): number => {
        const c = (chain || parsed.data.DEFAULT_CHAIN).toLowerCase();
        if (c === 'base' || c === 'base-mainnet' || c === 'base-sepolia') {
            return 0;
        }
        return parseInt(parsed.data.FEE_BPS) / 10000;
    }
};
