import { wallet as walletService } from "../src/services/wallet";
import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const proxyAddress = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const recipientAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
const userIndex = 96;

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    
    // 1. Resolve owner EOA
    const derived = walletService.deriveWallet(userIndex);
    const ownerWallet = new ethers.Wallet(derived.privateKey, provider);
    console.log(`Owner Wallet Address: ${ownerWallet.address}`);

    const pusd = new ethers.Contract(PUSD_ADDRESS, [
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address, uint256) returns (bool)"
    ], provider);

    const balance = await pusd.balanceOf(proxyAddress);
    console.log(`pUSD Balance in proxy: ${ethers.formatUnits(balance, 6)} pUSD`);

    if (balance === 0n) {
        console.log("No pUSD balance found in proxy.");
        return;
    }

    // 2. Formulate ERC-20 transfer call
    const transferInterface = new ethers.Interface([
        "function transfer(address, uint256) returns (bool)"
    ]);
    const encodedData = transferInterface.encodeFunctionData("transfer", [
        recipientAddress,
        balance
    ]);

    // 3. Instantiate Safe contract and fetch nonce
    const safe = new ethers.Contract(proxyAddress, [
        "function nonce() view returns (uint256)",
        "function getTransactionHash(address, uint256, bytes, uint8, uint256, uint256, uint256, address, address, uint256) view returns (bytes32)",
        "function execTransaction(address, uint256, bytes, uint8, uint256, uint256, uint256, address, address, bytes) payable returns (bool)"
    ], ownerWallet);

    const nonce = await safe.nonce();
    console.log(`Safe Nonce: ${nonce.toString()}`);

    // Safe transaction parameters
    const to = PUSD_ADDRESS;
    const value = 0;
    const data = encodedData;
    const operation = 0; // Call
    const safeTxGas = 0;
    const baseGas = 0;
    const gasPrice = 0;
    const gasToken = ethers.ZeroAddress;
    const refundReceiver = ethers.ZeroAddress;

    // 4. Get Safe transaction hash
    const safeTxHash = await safe.getTransactionHash(
        to,
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
    console.log(`Safe Tx Hash: ${safeTxHash}`);

    // 5. Sign the raw hash using ECDSA (without Ethereum Signed Message prefix)
    const signingKey = new ethers.SigningKey(derived.privateKey);
    const signature = signingKey.sign(safeTxHash);
    const sig = ethers.Signature.from(signature);
    
    // Gnosis Safe expects v = 27 or 28
    const v = sig.yParity + 27;
    const signatureBytes = ethers.concat([
        sig.r,
        sig.s,
        new Uint8Array([v])
    ]);
    console.log(`ECDSA Signature: ${signatureBytes}`);

    // 6. Execute direct transaction on Gnosis Safe
    console.log(`Sending execTransaction from owner EOA paying gas...`);
    const tx = await safe.execTransaction(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        signatureBytes,
        {
            gasLimit: 300000 // Provide safe gas limit buffer
        }
    );

    console.log(`Transaction sent! Hash: ${tx.hash}`);
    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`Transaction confirmed! Block: ${receipt.blockNumber}, Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);
}

main().catch(console.error);
