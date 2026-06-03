import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function check() {
    const POLYGON_RPC = "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    
    const TARGETS = [
        "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799", // Bot EOA
        "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02", // Deposit Wallet
        "0x3A5668F8B3E167771d503F0321c42a7B082789Ef"  // Relayer Wallet
    ];
    
    // Transfer(address from, address to, uint256 value)
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 50000; // last ~36 hours
    
    for (const target of TARGETS) {
        const topic2 = ethers.zeroPadValue(target, 32);
        const logs = await provider.getLogs({
            fromBlock,
            toBlock: "latest",
            topics: [transferTopic, null, topic2] // "to" is the 3rd topic (index 2)
        });
        
        console.log(`Found ${logs.length} incoming transfers for ${target}`);
        for (const log of logs) {
            console.log(`Token: ${log.address}, Tx: ${log.transactionHash}`);
        }
    }
}
check();
