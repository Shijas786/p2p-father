import { ethers } from "ethers";
import "dotenv/config";

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || "https://polygon-rpc.com");
    const address = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
    const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    
    const abi = [
        "event Transfer(address indexed from, address indexed to, uint256 value)"
    ];
    
    const contract = new ethers.Contract(pusdAddress, abi, provider);
    
    console.log(`Querying Transfer events for ${address}...`);
    
    // Query transfers *to* the user
    const toFilter = contract.filters.Transfer(null, address);
    const toEvents = await contract.queryFilter(toFilter, -100000); // scan last 100,000 blocks (~2 days)
    
    // Query transfers *from* the user
    const fromFilter = contract.filters.Transfer(address, null);
    const fromEvents = await contract.queryFilter(fromFilter, -100000);
    
    const allEvents = [...toEvents, ...fromEvents].sort((a, b) => a.blockNumber - b.blockNumber);
    
    console.log(`Found ${allEvents.length} transfer events in the last ~2 days:`);
    for (const event of allEvents) {
        const parsed = event as any;
        const from = parsed.args[0];
        const to = parsed.args[1];
        const value = ethers.formatUnits(parsed.args[2], 6);
        const type = to.toLowerCase() === address.toLowerCase() ? "IN" : "OUT";
        
        // Get block timestamp
        const block = await provider.getBlock(event.blockNumber);
        const timeStr = block ? new Date(block.timestamp * 1000).toLocaleString() : `Block ${event.blockNumber}`;
        
        console.log(`- [${timeStr}] ${type}: $${value} (From: ${from.slice(0, 8)}... To: ${to.slice(0, 8)}...) TX: ${event.transactionHash}`);
    }
}

main().catch(console.error);
