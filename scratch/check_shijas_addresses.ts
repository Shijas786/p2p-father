import { db } from "../src/db/client";
import { wallet as walletSvc } from "../src/services/wallet";

async function main() {
    const target1 = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02".toLowerCase();
    const target2 = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799".toLowerCase();

    for (let i = 0; i <= 2000; i++) {
        const addr = walletSvc.deriveWallet(i).address.toLowerCase();
        if (addr === target1) {
            console.log(`🎯 0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02 is HD Wallet Index ${i}`);
        }
        if (addr === target2) {
            console.log(`🎯 0x365d1970c1453bfB446F3fa57Ff440c05c2A5799 is HD Wallet Index ${i}`);
        }
    }
}

main().catch(console.error);
