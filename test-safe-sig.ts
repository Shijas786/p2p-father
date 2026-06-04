import { ethers } from "ethers";

async function test() {
    const pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const wallet = new ethers.Wallet(pk);
    
    // Hash we want to sign
    const hash = ethers.id("test");

    // Gnosis Safe expects eth_sign signature over the hash, with v + 4
    const sig = await wallet.signMessage(ethers.getBytes(hash));
    
    const sigBytes = ethers.getBytes(sig);
    sigBytes[64] += 4;
    const adjustedSig = ethers.hexlify(sigBytes);
    
    console.log(adjustedSig);
}
test();
