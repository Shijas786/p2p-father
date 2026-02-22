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

    // Supabase
    SUPABASE_URL: z.string().default(""),
    SUPABASE_ANON_KEY: z.string().default(""),
    SUPABASE_SERVICE_KEY: z.string().default(""),

    // Blockchain
    ESCROW_CONTRACT_ADDRESS: addressSchema.default(""),
    ESCROW_CONTRACT_ADDRESS_LEGACY: addressSchema.default(""),
    ESCROW_CONTRACT_ADDRESS_BSC: addressSchema.default(""),
    ESCROW_CONTRACT_ADDRESS_BSC_LEGACY: addressSchema.default(""),
    ADMIN_WALLET_ADDRESS: addressSchema.default(""),
    RELAYER_PRIVATE_KEY: z.string().default(""),
    MASTER_WALLET_SEED: z.string().default(""),
    BASE_RPC_URL: z.string().default("https://sepolia.base.org"),
    BSC_RPC_URL: z.string().default("https://bsc-dataseed.binance.org/"),
    USDC_ADDRESS: addressSchema.default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
    USDT_ADDRESS: addressSchema.default("0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"), // Axelar Wrapped USDT

    // Redis
    REDIS_URL: z.string().default(""),
    BROADCAST_CHANNEL_ID: z.string().optional(),

    // App Config
    FEE_BPS: z.string().default("100"),
    DEFAULT_CHAIN: z.string().default("base"),
    DEFAULT_TOKEN: z.string().default("USDC"),
    ESCROW_TIMEOUT_SECONDS: z.string().default("3600"),
    AUTO_RELEASE_SECONDS: z.string().default("2700"),
    NODE_ENV: z.string().default("development"),
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
};
