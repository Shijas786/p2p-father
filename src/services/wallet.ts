import { ethers } from "ethers";
import { env } from "../config/env";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

const ESCROW_ABI = [
    "function deposit(address token, uint256 amount)",
    "function withdraw(address token, uint256 amount)",
    "function release(uint256 tradeId)",
    "function createTradeByRelayer(address seller, address buyer, address token, uint256 amount, uint256 duration) returns (uint256)"
];

type Chain = 'base' | 'bsc';

class WalletService {
    private providers: Record<string, ethers.JsonRpcProvider | null> = {
        base: null,
        bsc: null
    };
    private masterNode: ethers.HDNodeWallet | null = null;

    private getProvider(chain: Chain = 'base'): ethers.JsonRpcProvider {
        if (!this.providers[chain]) {
            const url = chain === 'base' ? env.BASE_RPC_URL : env.BSC_RPC_URL;
            this.providers[chain] = new ethers.JsonRpcProvider(url);
        }
        return this.providers[chain]!;
    }

    private getMasterNode(): ethers.HDNodeWallet {
        if (!this.masterNode) {
            const seed = (env as any).MASTER_WALLET_SEED;
            if (!seed) throw new Error("MASTER_WALLET_SEED not set");
            this.masterNode = ethers.HDNodeWallet.fromPhrase(seed, undefined, "m/44'/60'/0'/0");
        }
        return this.masterNode;
    }

    private getAdminSigner(chain: Chain = 'base'): ethers.Wallet {
        if (!env.RELAYER_PRIVATE_KEY) throw new Error("RELAYER_PRIVATE_KEY needed");
        return new ethers.Wallet(env.RELAYER_PRIVATE_KEY, this.getProvider(chain));
    }

    deriveWallet(userIndex: number): { address: string; privateKey: string } {
        const master = this.getMasterNode();
        const child = master.deriveChild(userIndex);
        return { address: child.address, privateKey: child.privateKey };
    }

    getUserSigner(userIndex: number, chain: Chain = 'base'): ethers.Wallet {
        const { privateKey } = this.deriveWallet(userIndex);
        return new ethers.Wallet(privateKey, this.getProvider(chain));
    }

    getContractAddress(chain: Chain): string {
        return chain === 'base' ? env.ESCROW_CONTRACT_ADDRESS : env.ESCROW_CONTRACT_ADDRESS_BSC;
    }

    // ═══════════════════════════════════════
    //          BALANCE & INFO
    // ═══════════════════════════════════════

    async getBalances(address: string) {
        // Base - Native ETH
        const baseProvider = this.getProvider('base');
        const ethBal = await baseProvider.getBalance(address);
        const usdcBal = await this.getTokenBalance(address, env.USDC_ADDRESS, 'base');
        const usdtBal = await this.getTokenBalance(address, env.USDT_ADDRESS, 'base');

        // BSC - Native BNB
        const bscProvider = this.getProvider('bsc');
        const bnbBal = await bscProvider.getBalance(address);

        // BSC Token addresses
        const bscUsdc = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
        const bscUsdt = "0x55d398326f99059fF775485246999027B3197955";

        const bscUsdcBal = await this.getTokenBalance(address, bscUsdc, 'bsc');
        const bscUsdtBal = await this.getTokenBalance(address, bscUsdt, 'bsc');

        return {
            address,
            eth: ethers.formatEther(ethBal),
            usdc: usdcBal,
            usdt: usdtBal,
            bnb: ethers.formatEther(bnbBal),
            bsc_usdc: bscUsdcBal,
            bsc_usdt: bscUsdtBal
        };
    }

    async getTokenBalance(address: string, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const provider = this.getProvider(chain);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        try {
            const [balance, decimals] = await Promise.all([
                contract.balanceOf(address),
                contract.decimals()
            ]);
            return ethers.formatUnits(balance, decimals);
        } catch (e) {
            console.error(`Failed to get token balance for ${tokenAddress} on ${chain}`, e);
            return "0.0";
        }
    }

    // ═══════════════════════════════════════
    //          TRANSFERS
    // ═══════════════════════════════════════

    async sendNative(userIndex: number, to: string, amount: string | number, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getUserSigner(userIndex, chain);
        const tx = await signer.sendTransaction({
            to,
            value: ethers.parseEther(amountStr)
        });
        await tx.wait();
        return tx.hash;
    }

    async sendToken(userIndex: number, to: string, amount: string | number, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getUserSigner(userIndex, chain);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const decimals = await contract.decimals();
        const tx = await contract.transfer(to, ethers.parseUnits(amountStr, decimals));
        await tx.wait();
        return tx.hash;
    }

    // ═══════════════════════════════════════
    //          VAULT INTERACTIONS
    // ═══════════════════════════════════════

    async depositToVault(userIndex: number, amount: string | number, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getUserSigner(userIndex, chain);
        const contractAddress = this.getContractAddress(chain);

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const escrowContract = new ethers.Contract(contractAddress, ESCROW_ABI, signer);

        const decimals = await tokenContract.decimals();
        const amountUnits = ethers.parseUnits(amountStr, decimals);

        // 1. Smart Approve: Check existing allowance first
        const currentAllowance = await tokenContract.allowance(signer.address, contractAddress);
        if (currentAllowance < amountUnits) {
            console.log(`[WALLET] Insufficient allowance (${ethers.formatUnits(currentAllowance, decimals)}). Approving ${amount} ${tokenAddress}...`);
            const approveTx = await tokenContract.approve(contractAddress, amountUnits);
            await approveTx.wait();

            // Small Sleep to mitigate RPC state lag on L2s like Base
            await new Promise(r => setTimeout(r, 1000));
        }

        // 2. Deposit with Retry/Buffer for gas estimation lag
        try {
            const depositTx = await escrowContract.deposit(tokenAddress, amountUnits);
            await depositTx.wait();
            return depositTx.hash;
        } catch (err: any) {
            // If estimateGas fails with allowance error despite approve, try one more time after a longer sleep
            if (err.message.includes("allowance") || err.message.includes("estimateGas")) {
                console.warn("[WALLET] Deposit estimation failed, retrying after delay...", err.message);
                await new Promise(r => setTimeout(r, 3000));

                // One more check
                const allowanceAfterSleep = await tokenContract.allowance(signer.address, contractAddress);
                console.log(`[WALLET] Retrying. Allowance: ${ethers.formatUnits(allowanceAfterSleep, decimals)}`);

                const depositTx = await escrowContract.deposit(tokenAddress, amountUnits);
                await depositTx.wait();
                return depositTx.hash;
            }
            throw err;
        }
    }

    async withdrawFromVault(userIndex: number, amount: string | number, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getUserSigner(userIndex, chain);
        const contractAddress = this.getContractAddress(chain);

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer); // For decimals
        const escrowContract = new ethers.Contract(contractAddress, ESCROW_ABI, signer);

        const decimals = await tokenContract.decimals();
        const amountUnits = ethers.parseUnits(amountStr, decimals);

        const tx = await escrowContract.withdraw(tokenAddress, amountUnits);
        await tx.wait();

        return tx.hash;
    }

    async adminTransfer(to: string, amount: string | number, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getAdminSigner(chain);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const decimals = await contract.decimals();
        const tx = await contract.transfer(to, ethers.parseUnits(amountStr, decimals));
        await tx.wait();
        return tx.hash;
    }
}

export const wallet = new WalletService();
