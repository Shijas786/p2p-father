import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// In-memory cache to avoid constant DB reads
let cachedGroups: number[] | null = null;

export const groupManager = {
    // Add group ID
    addGroup: async (chatId: number) => {
        // Upsert into Supabase
        await supabase
            .from("bot_groups")
            .upsert({ chat_id: chatId }, { onConflict: "chat_id" });

        // Update cache
        if (cachedGroups && !cachedGroups.includes(chatId)) {
            cachedGroups.push(chatId);
        } else {
            cachedGroups = null; // Force refresh
        }
    },

    // Remove group ID
    removeGroup: async (chatId: number) => {
        await supabase
            .from("bot_groups")
            .delete()
            .eq("chat_id", chatId);

        if (cachedGroups) {
            cachedGroups = cachedGroups.filter(id => id !== chatId);
        }
    },

    // Get all groups
    getGroups: async (): Promise<number[]> => {
        if (cachedGroups) return cachedGroups;

        const { data } = await supabase
            .from("bot_groups")
            .select("chat_id");

        cachedGroups = (data || []).map((r: any) => r.chat_id);
        return cachedGroups!;
    }
};
