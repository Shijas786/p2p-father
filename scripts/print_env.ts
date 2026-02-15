import { env } from '../src/config/env';

console.log('Environment Config:');
console.log(`BASE_RPC_URL: ${env.BASE_RPC_URL}`);
console.log(`USDC_ADDRESS: ${env.USDC_ADDRESS}`);
console.log(`USDT_ADDRESS: ${env.USDT_ADDRESS}`);
console.log(`ESCROW_CONTRACT_ADDRESS: ${env.ESCROW_CONTRACT_ADDRESS}`);
console.log(`NODE_ENV: ${env.NODE_ENV}`);
