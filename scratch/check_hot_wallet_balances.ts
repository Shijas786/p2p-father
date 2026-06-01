import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const walletsToCheck = [
    { name: "rijithpothan20", address: "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787", expected: 35.42 },
    { name: "Tintu (null)", address: "0x5E3b3E7B666F215c6B6FfF9b4022157FCfd5cC72", expected: 13.67 },
    { name: "cnfvck", address: "0x6527161Cc06508a4CB9276fcf52A232A242Aa3Bb", expected: 7.25 },
    { name: "faarix", address: "0x36A233EB39c306A5040A9233C03109ecDfc67154", expected: 5.00 },
    { name: "SiBiN_Sibi", address: "0xe38d0948c0dF1140bd659270BefdE02B88583980", expected: 3.72 },
    { name: "Medphysicist", address: "0xbBFf51FEf421052A0bc84583EcE739902DF024B3", expected: 1.35 },
    { name: "Vipin (null)", address: "0x039Ec002378b57f88fb51Fc58357337Cf9969AC8", expected: 1.00 },
    { name: "trix_0077", address: "0x1Ce8f52B75D32d5c4785F027B76E994ED1334f3a", expected: 0.60 },
    { name: "shijas", address: "0x6c31212a23040998e1d1c157ace3982abdbe3154", expected: 0.29 },
    { name: "ashmithpraman", address: "0x2517289b15ac4A3a769D8A344d605c0C4559CA70", expected: 0.16 },
    { name: "itesaitama", address: "0x7c06785275BbFDd4d71c157596DBd9F06dDA1A77", expected: 0.10 },
    { name: "shazilasf", address: "0xa0be468fd909b0d9e12150755c9d8dabe978def4", expected: 0.10 }
];

async function check() {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, provider);
    
    console.log("Checking physical ERC20 balances for extracted wallets...\n");
    for (const w of walletsToCheck) {
        const bal = await usdt.balanceOf(w.address);
        const formatted = parseFloat(ethers.formatEther(bal)).toFixed(2);
        const icon = formatted >= w.expected ? "✅" : "❌";
        console.log(`${icon} ${w.name}: Expected ~${w.expected.toFixed(2)}, Actual = ${formatted} USDT`);
    }
}
check().catch(console.error);
