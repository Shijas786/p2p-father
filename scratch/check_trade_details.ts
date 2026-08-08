import { feeCashbackService } from "../src/services/feeCashbackService";

async function main() {
    console.log("=== Testing Fee Cashback Processing for Trade 64d37fd3-efc8-4d61-9064-e1540358e027 ===");
    await feeCashbackService.processTradeFeeCashback('64d37fd3-efc8-4d61-9064-e1540358e027');
    console.log("Done!");
}

main().catch(console.error);
