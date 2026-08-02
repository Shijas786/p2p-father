/**
 * Adsgram Interstitial Helper
 * Block ID: int-40921
 */
export const ADSGRAM_BLOCK_ID = "int-40921";

export const showAdsgramAd = async (blockId: string = ADSGRAM_BLOCK_ID): Promise<boolean> => {
    try {
        if (typeof window !== "undefined" && (window as any).Adsgram) {
            const AdController = (window as any).Adsgram.init({ blockId });
            await AdController.show();
            console.log("[Adsgram] Ad shown successfully");
            return true;
        } else {
            console.warn("[Adsgram] Adsgram SDK not loaded on window");
        }
    } catch (e: any) {
        console.warn("[Adsgram] Ad dismissed, skipped or error:", e);
    }
    return false;
};
