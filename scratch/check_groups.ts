import { groupManager } from "../src/utils/groupManager";
import dotenv from "dotenv";
dotenv.config();

async function run() {
    try {
        const groups = await groupManager.getGroups();
        console.log("Found groups:", groups);
    } catch (err) {
        console.error("Error:", err);
    }
}
run();
