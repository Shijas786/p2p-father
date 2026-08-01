import { db } from "../db/client";

export interface VIPUserConfig {
    telegramId: string;
    username: string;
    rebateBps: number; // e.g. 25 = 0.25%
    applyAfterTimestamp: number; // Order creation timestamp cutoff (ms)
}

// Configured VIP Traders for Fee Cashback / Rebate
// 0.25% rebate applies to new ads created after this cutoff
export const VIP_FEE_CONFIGS: VIPUserConfig[] = [
    {
        telegramId: "987654321",
        username: "vip_trader",
        rebateBps: 25, // 0.25% rebate
        applyAfterTimestamp: 1754067180000 // 2026-08-01 22:33:00 UTC timestamp cutoff
    }
];

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
