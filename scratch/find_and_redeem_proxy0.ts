import { wallet as walletService } from "../src/services/wallet";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

const adapters = [
    "0xAdA100Db00Ca00073811820692005400218FcE1f", // CtfCollateralAdapter (V2)
    "0xADa100874d00e3331D00F2007a9c336a65009718"  // CtfCollateralAdapter (V1)
];

const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
const userIndex = 0; // EOA 0 owns Proxy 0

async function executeSafeCall(safe: any, ownerWallet: any, privateKey: string, target: string, data: string) {
    const nonce = await safe.nonce();
    console.log(`Executing Safe Call... Target: ${target}, Nonce: ${nonce.toString()}`);

    const value = 0;
    const operation = 0; // Call
    const safeTxGas = 0;
    const baseGas = 0;
    const gasPrice = 0;
    const gasToken = ethers.ZeroAddress;
    const refundReceiver = ethers.ZeroAddress;

    const safeTxHash = await safe.getTransactionHash(
        target,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        nonce
    );

    const signingKey = new ethers.SigningKey(privateKey);
    const signature = signingKey.sign(safeTxHash);
    const sig = ethers.Signature.from(signature);
    const v = sig.yParity + 27;
    const signatureBytes = ethers.concat([sig.r, sig.s, new Uint8Array([v])]);

    const tx = await safe.execTransaction(
        target,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        signatureBytes,
        { gasLimit: 500000 }
    );
    console.log(`Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Tx confirmed! Block: ${receipt.blockNumber}, Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);
    return receipt;
}

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const derived = walletService.deriveWallet(userIndex);
    const ownerWallet = new ethers.Wallet(derived.privateKey, provider);

    console.log(`Owner EOA Address: ${ownerWallet.address}`);
    console.log(`Proxy Safe Address: ${proxyAddress}`);

    const ctf = new ethers.Contract(CTF_ADDRESS, [
        "function isApprovedForAll(address, address) view returns (bool)",
        "function setApprovalForAll(address, bool)"
    ], provider);

    const safe = new ethers.Contract(proxyAddress, [
        "function nonce() view returns (uint256)",
        "function getTransactionHash(address, uint256, bytes, uint8, uint256, uint256, uint256, address, address, uint256) view returns (bytes32)",
        "function execTransaction(address, uint256, bytes, uint8, uint256, uint256, uint256, address, address, bytes) payable returns (bool)"
    ], ownerWallet);

    // 1. Approve both adapters if not already approved
    const ctfInterface = new ethers.Interface(["function setApprovalForAll(address, bool)"]);
    
    for (const adapter of adapters) {
        const approved = await ctf.isApprovedForAll(proxyAddress, adapter);
        console.log(`Adapter ${adapter} approved? ${approved}`);
        if (!approved) {
            console.log(`Approve adapter ${adapter}...`);
            const approveData = ctfInterface.encodeFunctionData("setApprovalForAll", [adapter, true]);
            await executeSafeCall(safe, ownerWallet, derived.privateKey, CTF_ADDRESS, approveData);
        }
    }

    // 2. Call redeemPositions on both adapters
    const adapterInterface = new ethers.Interface([
        "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)"
    ]);

    const redeemData = adapterInterface.encodeFunctionData("redeemPositions", [
        PUSD_ADDRESS,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        conditionId,
        [2] // IndexSet 2
    ]);

    for (const adapter of adapters) {
        console.log(`\nAttempting redemption on adapter ${adapter}...`);
        try {
            await executeSafeCall(safe, ownerWallet, derived.privateKey, adapter, redeemData);
            console.log(`Redemption on adapter ${adapter} completed!`);
        } catch (err: any) {
            console.error(`Redemption on adapter ${adapter} failed:`, err.message);
        }
    }
}

main().catch(console.error);
