import { polymarketRelayerService } from "../src/services/relayer";

const targetAddr = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799".toLowerCase();

async function main() {
    console.log("Searching derived proxy addresses for 0 to 2000...");
    for (let index = 0; index < 2000; index++) {
        try {
            const proxyAddress = await polymarketRelayerService.resolveDepositWallet(index);
            if (proxyAddress && proxyAddress.toLowerCase() === targetAddr) {
                console.log(`\nMATCH FOUND!`);
                console.log(`User index: ${index}`);
                console.log(`Matched proxy: ${proxyAddress}\n`);
                return;
            }
        } catch (e: any) {
            // Ignore
        }
    }
    console.log("No match found in index 0-2000.");
}

main().catch(console.error);
