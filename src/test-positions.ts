import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { config } from "dotenv";
import axios from "axios";
import crypto from "crypto";

config();

async function main() {
    // 1. We mock the EOA credentials for testing (we can grab them from the DB if we want, but we can just derive them here)
    // Wait, the sandbox has no internet. I cannot run this script locally.
    console.log("Cannot test in sandbox due to no internet");
}

main();
