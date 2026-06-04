import { db } from "./src/database";
import { polymarketRelayerService } from "./src/services/relayer";
import { polymarketService } from "./src/services/polymarket";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const user = await db.getUserByTelegramId(123456789);
    if (!user) { console.log("User not found"); return; }
    
    const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index);
    console.log("Proxy Address:", proxyAddress);
    
    const positions = await polymarketService.getPositionsForProxy(proxyAddress);
    console.log("Positions:", positions.map(p => ({
        conditionId: p.conditionId,
        size: p.size,
        redeemable: p.redeemable
    })));
}
main().catch(console.error);
