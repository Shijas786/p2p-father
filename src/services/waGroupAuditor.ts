import fs from "fs";
import path from "path";
import { db } from "../db/client";
import { env } from "../config/env";
import { hypermeowClient } from "../whatsapp/hypermeowClient";
import { redis } from "./redis";

const PERSISTENT_DATA_DIR = fs.existsSync("/app/hypermeow-bridge/data")
    ? "/app/hypermeow-bridge/data"
    : path.resolve(__dirname, "../../data");

const REMINDED_FILE = path.join(PERSISTENT_DATA_DIR, "wa_reminded_users.json");

// Pre-seeded with the 44 users who were reminded on 2026-10-24
const SEEDED_REMINDED = [
    "917708961835", "919388449988", "919895212920", "918078858932",
    "919567026754", "919562220045", "919961517032", "919895327330",
    "919745935841", "919656405931", "919747913291", "919544774310",
    "919061234895", "916282917606", "919778300863", "918714333192",
    "919995191857", "919846169893", "918111976084", "917994151149",
    "918606513036", "918590692407", "918606382762", "919656575887",
    "919895167495", "918807567105", "8562096364968", "917994464304",
    "918136965695", "917012891462", "919747777019", "918129636088",
    "919383487774", "918111978593", "971522869944", "919895624900",
    "971506584784", "97470648371", "917907313159", "919539725232",
    "919747406830", "919292164916", "919895607693", "919400467504"
];

function loadPersistentReminded(): Set<string> {
    const set = new Set<string>(SEEDED_REMINDED);
    try {
        if (fs.existsSync(REMINDED_FILE)) {
            const raw = fs.readFileSync(REMINDED_FILE, "utf-8");
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                for (const phone of arr) set.add(phone);
            }
        }
    } catch {
        // ignore read error
    }
    return set;
}

function savePersistentReminded(phone: string) {
    try {
        const set = loadPersistentReminded();
        set.add(phone);
        if (!fs.existsSync(PERSISTENT_DATA_DIR)) {
            fs.mkdirSync(PERSISTENT_DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(REMINDED_FILE, JSON.stringify([...set], null, 2));
    } catch {
        // ignore write error
    }
}

export interface AuditedUser {
    id: string;
    phone: string;
    name: string;
    createdAt: string;
}

export interface WAGroupAuditReport {
    success: boolean;
    groupJid: string;
    groupTopic: string;
    totalGroupMembers: number;
    timeframeDays: number;
    since: string;
    totalDmUsers: number;
    joinedCount: number;
    notJoinedCount: number;
    joinedUsers: AuditedUser[];
    notJoinedUsers: AuditedUser[];
    error?: string;
}

export interface SendRemindersResult {
    success: boolean;
    dryRun: boolean;
    totalTargets: number;
    sentCount: number;
    skippedAlreadyReminded: number;
    failedCount: number;
    details: Array<{ phone: string; status: "sent" | "skipped_reminded" | "failed"; error?: string }>;
}

function cleanDigits(val: string | null | undefined): string {
    if (!val) return "";
    return val.replace(/[^0-9]/g, "");
}

function getLast10(val: string | null | undefined): string {
    const digits = cleanDigits(val);
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

export class WAGroupAuditor {
    /**
     * Audits users who personally DMed the WhatsApp bot within `days`
     * and compares against the current participants in the official WhatsApp community group.
     */
    async auditNonJoiners(days = 2): Promise<WAGroupAuditReport> {
        try {
            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const sinceIso = cutoffDate.toISOString();

            // 1. Fetch DM users from DB who engaged within the timeframe
            const supabase = db.getClient();
            const { data: dmUsers, error: dbErr } = await supabase
                .from("users")
                .select("id, phone_number, whatsapp_phone, first_name, username, created_at")
                .not("whatsapp_phone", "is", null)
                .gte("created_at", sinceIso)
                .order("created_at", { ascending: false });

            if (dbErr) {
                throw new Error(`Failed to query users: ${dbErr.message}`);
            }

            // 2. Determine target community group JID
            let targetGroupJid = env.WA_OFFICIAL_GROUP_JID || (process.env as any).WA_OFFICIAL_GROUP_JID || "120363410362268845@g.us";
            const { data: activeGroups } = await supabase
                .from("whatsapp_groups")
                .select("group_jid, group_name")
                .eq("active", true)
                .limit(1);

            if (activeGroups && activeGroups.length > 0 && activeGroups[0].group_jid) {
                targetGroupJid = activeGroups[0].group_jid;
            }

            // 3. Fetch live group member list from WhatsApp bridge
            const groupMetadata = await hypermeowClient.getGroupMetadata(targetGroupJid);
            const participants: any[] = groupMetadata?.participants || [];
            const groupTopic = groupMetadata?.topic || "P2PFather Community";

            // Index group members by exact digits, last 10 digits, and LID digits
            const groupMemberPhones = new Set<string>();
            const groupMemberLast10 = new Set<string>();
            const groupMemberLids = new Set<string>();

            for (const p of participants) {
                const rawJid = p.jid || p.id || "";
                const phoneField = p.phone || "";
                const lidField = p.lid || "";

                // 1. Phone digits
                const rawPhone = phoneField || (rawJid && !rawJid.includes("@lid") ? rawJid.split("@")[0].split(":")[0] : "");
                const digits = cleanDigits(rawPhone);
                if (digits) {
                    groupMemberPhones.add(digits);
                    const l10 = getLast10(digits);
                    if (l10) groupMemberLast10.add(l10);
                }

                // 2. LID digits
                const rawLid = lidField || (rawJid.includes("@lid") ? rawJid.split("@")[0].split(":")[0] : "");
                const lidDigits = cleanDigits(rawLid);
                if (lidDigits) {
                    groupMemberLids.add(lidDigits);
                }
            }

            const joined: AuditedUser[] = [];
            const notJoined: AuditedUser[] = [];

            for (const user of dmUsers || []) {
                const phone = cleanDigits(user.whatsapp_phone || user.phone_number);
                if (!phone) continue;

                const l10 = getLast10(phone);
                let hasJoined = groupMemberPhones.has(phone) || Boolean(l10 && groupMemberLast10.has(l10));

                // If not matched directly by phone, resolve LID from WhatsApp bridge store
                if (!hasJoined && groupMemberLids.size > 0) {
                    try {
                        const contactInfo = await hypermeowClient.getContactInfo(phone);
                        if (contactInfo?.lid) {
                            const userLidDigits = cleanDigits(contactInfo.lid);
                            if (groupMemberLids.has(userLidDigits)) {
                                hasJoined = true;
                            }
                        }
                    } catch {
                        // ignore resolution failure, proceed with hasJoined = false
                    }
                }

                const item: AuditedUser = {
                    id: user.id,
                    phone: phone,
                    name: user.first_name || user.username || `Trader ${phone.slice(-4)}`,
                    createdAt: user.created_at,
                };

                if (hasJoined) {
                    joined.push(item);
                } else {
                    notJoined.push(item);
                }
            }

            return {
                success: true,
                groupJid: targetGroupJid,
                groupTopic,
                totalGroupMembers: participants.length,
                timeframeDays: days,
                since: sinceIso,
                totalDmUsers: (dmUsers || []).length,
                joinedCount: joined.length,
                notJoinedCount: notJoined.length,
                joinedUsers: joined,
                notJoinedUsers: notJoined,
            };
        } catch (err: any) {
            console.error("[WAGroupAuditor] Audit error:", err);
            return {
                success: false,
                groupJid: "",
                groupTopic: "",
                totalGroupMembers: 0,
                timeframeDays: days,
                since: new Date(Date.now() - days * 86400 * 1000).toISOString(),
                totalDmUsers: 0,
                joinedCount: 0,
                notJoinedCount: 0,
                joinedUsers: [],
                notJoinedUsers: [],
                error: err?.message || String(err),
            };
        }
    }

    /**
     * Sends a polite, 1-tap WhatsApp invitation to users who DMed the bot but haven't joined the group.
     * Uses rate-limiting (3.5s–5s jitter) and deduplication (7-day Redis lock) to prevent bans and spam.
     */
    async sendRemindersToNonJoiners(options: {
        days?: number;
        limit?: number;
        dryRun?: boolean;
        delayMs?: number;
    } = {}): Promise<SendRemindersResult> {
        const days = options.days ?? 2;
        const limit = options.limit ?? 50;
        const dryRun = options.dryRun ?? true;
        const delayMs = options.delayMs ?? 5000;

        const audit = await this.auditNonJoiners(days);
        if (!audit.success) {
            throw new Error(`Audit failed: ${audit.error}`);
        }

        const groupLink = env.WA_COMMUNITY_LINK || "https://chat.whatsapp.com/Ldh9H8ESVLuJUROs5rbvvv?mode=gi_t";

        const result: SendRemindersResult = {
            success: true,
            dryRun,
            totalTargets: audit.notJoinedUsers.length,
            sentCount: 0,
            skippedAlreadyReminded: 0,
            failedCount: 0,
            details: [],
        };

        const persistentReminded = loadPersistentReminded();
        let currentIdx = 0;
        for (const user of audit.notJoinedUsers) {
            if (result.sentCount >= limit) break;
            currentIdx++;

            const cacheKey = `wa_group_reminded:${user.phone}`;
            const alreadyReminded = persistentReminded.has(user.phone) || Boolean(await redis.get(cacheKey).catch(() => null));

            if (alreadyReminded) {
                result.skippedAlreadyReminded++;
                result.details.push({ phone: user.phone, status: "skipped_reminded" });
                continue;
            }

            if (dryRun) {
                result.sentCount++;
                result.details.push({ phone: user.phone, status: "sent" });
                continue;
            }

            const messageText =
                `Hey bro, you didn't join our group? We drop early listing announcements and alpha there before it gets posted anywhere else.\n\n` +
                `Hop in if you want:\n${groupLink}`;

            const recipientJid = `${user.phone}@s.whatsapp.net`;
            const sent = await hypermeowClient.sendText(recipientJid, messageText);

            if (sent) {
                result.sentCount++;
                result.details.push({ phone: user.phone, status: "sent" });
                // Mark as reminded for 7 days in Redis & permanently on disk
                await redis.setex(cacheKey, 7 * 86400, Date.now().toString()).catch(() => {});
                savePersistentReminded(user.phone);
                console.log(`[WAGroupAuditor] ✅ Sent group invite reminder to ${user.phone}`);
            } else {
                result.failedCount++;
                result.details.push({ phone: user.phone, status: "failed", error: "sendText returned false" });
                console.warn(`[WAGroupAuditor] ❌ Failed to send group reminder to ${user.phone}`);
            }

            // Anti-spam jitter pacing: 5 to 10 seconds per user
            const jitter = 5000 + Math.floor(Math.random() * 5000);
            await new Promise((resolve) => setTimeout(resolve, jitter));
        }

        return result;
    }
}

export const waGroupAuditor = new WAGroupAuditor();
