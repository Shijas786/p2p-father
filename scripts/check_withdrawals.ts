
import { ethers } from 'ethers';
import { env } from '../src/config/env';

async function main() {
    // BASE
    console.log('--- BASE WITHDRAWALS ---');
    try {
        const p = new ethers.JsonRpcProvider('https://mainnet.base.org');
        const c = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, ['event Withdraw(address indexed user, address indexed token, uint256 amount)'], p);
        const filter = c.filters.Withdraw();
        const logs = await c.queryFilter(filter, -10000);
        console.log('Recent Withdrawals:', logs.length);
        logs.forEach((l: any) => { console.log('User:', l.args[0], 'Amt:', ethers.formatUnits(l.args[2], 6), 'Tx:', l.transactionHash, 'Block:', l.blockNumber); });
    } catch (e) { console.error('Base Error:', e); }

    /*
    // BSC
    console.log('\n--- BSC WITHDRAWALS ---');
    try {
        const pBSC = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
        const cBSC = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS_BSC, ['event Withdraw(address indexed user, address indexed token, uint256 amount)'], pBSC);
        const filterBSC = cBSC.filters.Withdraw();
        const logsBSC = await cBSC.queryFilter(filterBSC, -10000);
        console.log('Recent Withdrawals:', logsBSC.length);
        logsBSC.forEach((l: any) => { console.log('User:', l.args[0], 'Amt:', ethers.formatUnits(l.args[2], 18)); });
    } catch (e) { console.error('BSC Error:', e); }
    */
}
main();
