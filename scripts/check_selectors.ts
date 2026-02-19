import { escrow } from "../src/services/escrow";
import { ethers } from "ethers";

async function main() {
    // @ts-ignore - accessing private for debug
    const iface = escrow.getEscrowContract('base').interface;
    
    console.log("Bot ABI Selectors:");
    iface.forEachFunction((fn) => {
        console.log(`${fn.name}(${fn.inputs.map(i => i.type).join(",")}): ${iface.getSelector(fn)}`);
    });
}

main();
