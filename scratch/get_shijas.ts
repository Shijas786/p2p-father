import { db } from "../src/db/client";

async function main() {
    const ids = await db.getAllTelegramIds();
    for (const id of ids) {
        const user = await db.getUserByTelegramId(id);
        if (user && user.username && user.username.toLowerCase().includes("shijas")) {
            console.log(user);
        }
    }
}
main().catch(console.error).finally(() => process.exit(0));
