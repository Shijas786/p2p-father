import { escrow } from "./src/services/escrow";
import { ethers } from "ethers";

async function main() {
    const provider = (escrow as any).getProvider("bsc");
    const contract = (escrow as any).getEscrowContract("bsc");
    const address = await contract.getAddress();

    console.log(`Calling trades(63) on ${address}...`);

    // Function signature for mapping: trades(uint256)
    // Selector: 0x2287f3b8 (keccak256("trades(uint256)"))
    const selector = "0x2287f3b8";
    const tradeIdHex = ethers.zeroPadValue(ethers.toBeHex(63), 32);
    const data = selector + tradeIdHex.slice(2);

    try {
        const result = await provider.call({
            to: address,
            data: data
        });

        console.log(`Raw Result: ${result}`);

        if (result !== "0x") {
            // Try to decode based on common trade struct members
            // Tuple: address, address, address, uint256, uint256, uint256, uint8, ...
            console.log("Decoding attempt...");
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ["address", "address", "address", "uint256", "uint256", "uint256", "uint8", "uint256", "uint256", "uint256", "address", "string"],
                result
            );
            console.log("Decoded Status:", decoded[6]);
            console.log("Seller:", decoded[0]);
        }
    } catch (e: any) {
        console.error("Call failed:", e.message);
    }
}

main().catch(console.error);
