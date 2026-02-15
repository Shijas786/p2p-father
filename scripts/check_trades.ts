
import { ethers } from 'ethers';
import { env } from '../src/config/env';

async function main() {
    // BASE
    console.log('--- BASE TRADES ---');
    try {
        const p = new ethers.JsonRpcProvider('https://mainnet.base.org');
        const c = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, ['event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount)'], p);
        const filter = c.filters.TradeCreated();
        const logs = await c.queryFilter(filter, -200000);
        console.log('Recent Trades:', logs.length);
        logs.forEach((l: any) => { console.log('ID:', l.args[0], 'Seller:', l.args[1], 'Buyer:', l.args[2], 'Amt:', ethers.formatUnits(l.args[4], 6)); });
    } catch (e) { console.error('Base Error:', e); }

    /*
    // BSC
    console.log('\n--- BSC TRADES ---');
    try {
        const pBSC = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
        const cBSC = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, ['event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount)'], pBSC);
        const filterBSC = cBSC.filters.TradeCreated();
        const logsBSC = await cBSC.queryFilter(filterBSC, -10000);
        console.log('Recent Trades:', logsBSC.length);
        logsBSC.forEach((l: any) => { console.log('ID:', l.args[0], 'Amt:', ethers.formatUnits(l.args[4], 18)); });
    } catch (e) { console.error('BSC Error:', e); }
    */
}
main();
