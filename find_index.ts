import { walletService } from "./src/services/wallet";
const target = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799".toLowerCase();
for (let i = 1; i < 5000; i++) {
    const derived = walletService.deriveWallet(i);
    if (derived.address.toLowerCase() === target) {
        console.log(`Found index: ${i}`);
        process.exit(0);
    }
}
console.log("Not found in first 5000");
