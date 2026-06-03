import { ethers } from "ethers";
import { config } from "dotenv";
config();
const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY!);
console.log(wallet.address);
