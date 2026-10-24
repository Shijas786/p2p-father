import "dotenv/config";
import { waGroupAuditor } from "../src/services/waGroupAuditor";

async function main() {
    const args = process.argv.slice(2);
    const isSend = args.includes("--send");
    const daysArg = args.find((a) => a.startsWith("--days="));
    const days = daysArg ? Number(daysArg.split("=")[1]) : 2;
    const limitArg = args.find((a) => a.startsWith("--limit="));
    const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

    console.log(`\n========================================`);
    console.log(`🔍 P2PFather WhatsApp Group Joiner Audit`);
    console.log(`📅 Timeframe: Past ${days} days`);
    console.log(`⚡ Mode: ${isSend ? "🔴 LIVE SEND" : "🟢 DRY RUN AUDIT ONLY"}`);
    console.log(`========================================\n`);

    console.log("Fetching live group members and DM users...");
    const audit = await waGroupAuditor.auditNonJoiners(days);

    if (!audit.success) {
        console.error("❌ Audit failed:", audit.error);
        process.exit(1);
    }

    console.log(`\n📊 AUDIT RESULTS:`);
    console.log(`• Group Topic:          ${audit.groupTopic}`);
    console.log(`• Group JID:            ${audit.groupJid}`);
    console.log(`• Total Group Members:  ${audit.totalGroupMembers}`);
    console.log(`• DMed Bot in ${days}d:       ${audit.totalDmUsers}`);
    console.log(`• Already Joined Group: ${audit.joinedCount}`);
    console.log(`• NOT Joined Group:     ${audit.notJoinedCount}`);

    if (audit.notJoinedUsers.length > 0) {
        console.log(`\n📋 Non-Joiners Preview (first 10):`);
        audit.notJoinedUsers.slice(0, 10).forEach((u, i) => {
            console.log(`  ${i + 1}. +${u.phone} (${u.name}) - DMed: ${u.createdAt}`);
        });
        if (audit.notJoinedUsers.length > 10) {
            console.log(`  ... and ${audit.notJoinedUsers.length - 10} more`);
        }
    }

    if (!isSend) {
        console.log(`\n💡 To send WhatsApp group invitation reminders to these users, run:`);
        console.log(`   npx tsx scripts/wa-group-audit.ts --days=${days} --limit=${limit} --send\n`);
        process.exit(0);
    }

    console.log(`\n🚀 Sending live invitations (limit: ${limit}, 3.5s-5s pacing)...`);
    const result = await waGroupAuditor.sendRemindersToNonJoiners({
        days,
        limit,
        dryRun: false,
    });

    console.log(`\n✅ DISPATCH SUMMARY:`);
    console.log(`• Targets attempted: ${result.totalTargets}`);
    console.log(`• Successfully sent: ${result.sentCount}`);
    console.log(`• Skipped (reminded): ${result.skippedAlreadyReminded}`);
    console.log(`• Failed:            ${result.failedCount}\n`);

    process.exit(0);
}

main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
});
