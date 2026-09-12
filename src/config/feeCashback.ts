import { db } from "../db/client";

export interface VIPUserConfig {
    telegramId: string;
    username: string;
    rebateBps: number; // e.g. 25 = 0.25%
    applyAfterTimestamp: number; // Order creation timestamp cutoff (ms)
}

// Default VIP traders list
const DEFAULT_VIP_CONFIGS: VIPUserConfig[] = [
    {
        telegramId: "6155236178",
        username: "CmdrAj",
        rebateBps: 25, // 0.25% rebate
        applyAfterTimestamp: 1754067180000 // 2026-08-01 cutoff
    }
];

// Configured VIP Traders for Fee Cashback / Rebate (Configurable via VIP_FEE_CONFIGS_JSON with fallback)
export const VIP_FEE_CONFIGS: VIPUserConfig[] = process.env.VIP_FEE_CONFIGS_JSON
    ? (() => {
          try {
              const parsed = JSON.parse(process.env.VIP_FEE_CONFIGS_JSON);
              return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_VIP_CONFIGS;
          } catch {
              return DEFAULT_VIP_CONFIGS;
          }
      })()
    : DEFAULT_VIP_CONFIGS;

/**
 * Helper to check if an order/trade qualifies for VIP fee cashback
 */
export function getQualifyingVIPConfig(
    userTelegramId: string | number | undefined | null,
    username: string | undefined | null,
    orderCreatedAt: string | number | Date | undefined | null
): VIPUserConfig | null {
    if (!userTelegramId && !username) return null;

    const tgIdStr = userTelegramId ? userTelegramId.toString() : "";
    const cleanUsername = username ? username.replace(/^@/, "").toLowerCase() : "";

    const orderTime = orderCreatedAt ? new Date(orderCreatedAt).getTime() : Date.now();

    for (const vip of VIP_FEE_CONFIGS) {
        const matchesId = tgIdStr !== "" && vip.telegramId === tgIdStr;
        const matchesName = cleanUsername !== "" && vip.username.toLowerCase() === cleanUsername;

        if ((matchesId || matchesName) && orderTime >= vip.applyAfterTimestamp) {
            return vip;
        }
    }

    return null;
}
