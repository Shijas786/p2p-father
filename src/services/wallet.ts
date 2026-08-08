import { ethers } from "ethers";
import { env } from "../config/env";
import { getFastProvider } from "../utils/provider";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

const ESCROW_ABI = [
    "function deposit(address token, uint256 amount) payable",
    "function withdraw(address token, uint256 amount)",
    "function release(uint256 tradeId)",
    "function createTradeByRelayer(address seller, address buyer, address token, uint256 amount, uint256 duration) returns (uint256)",
    "function balances(address user, address token) view returns (uint256)"
];

type Chain = 'base' | 'bsc' | 'polygon' | 'mainnet' | 'arbitrum' | 'optimism' | 'avalanche' | 'linea' | 'scroll';

class WalletService {
    private providers: Record<string, ethers.Provider | null> = {
        base: null, bsc: null, polygon: null, mainnet: null, 
        arbitrum: null, optimism: null, avalanche: null, linea: null, scroll: null
    };
    private masterNode: ethers.HDNodeWallet | null = null;

    private getProvider(chain: Chain = 'base'): ethers.Provider {
        return getFastProvider(chain);
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
        const baseProvider = this.getProvider('base');
        const bscProvider = this.getProvider('bsc');
        const polProvider = this.getProvider('polygon');

        const bscUsdc = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
        const bscUsdt = "0x55d398326f99059fF775485246999027B3197955";
        const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

        // 🚀 Parallel RPC execution using Promise.all for instant response
        const [
            ethBal, usdcBal, usdtBal,
            bnbBal, bscUsdcBal, bscUsdtBal,
            polBal, pusdBal,
            vaultBaseUsdc, vaultBaseUsdt, vaultBscBnb, vaultBscUsdc, vaultBscUsdt
        ] = await Promise.all([
            baseProvider.getBalance(address).catch(() => 0n),
            this.getTokenBalance(address, env.USDC_ADDRESS, 'base', 6).catch(() => "0.0"),
            this.getTokenBalance(address, env.USDT_ADDRESS, 'base', 6).catch(() => "0.0"),
            bscProvider.getBalance(address).catch(() => 0n),
            this.getTokenBalance(address, bscUsdc, 'bsc', 18).catch(() => "0.0"),
            this.getTokenBalance(address, bscUsdt, 'bsc', 18).catch(() => "0.0"),
            polProvider.getBalance(address).catch(() => 0n),
            this.getTokenBalance(address, pusdAddress, 'polygon', 18).catch(() => "0.0"),
            this.getVaultBalance(address, env.USDC_ADDRESS, 'base').catch(() => "0.0"),
            this.getVaultBalance(address, env.USDT_ADDRESS, 'base').catch(() => "0.0"),
            this.getVaultBalance(address, "0x0000000000000000000000000000000000000000", 'bsc').catch(() => "0.0"),
            this.getVaultBalance(address, bscUsdc, 'bsc').catch(() => "0.0"),
            this.getVaultBalance(address, bscUsdt, 'bsc').catch(() => "0.0")
        ]);

        return {
            address,
            eth: ethers.formatEther(ethBal),
            usdc: usdcBal,
            usdt: usdtBal,
            bnb: ethers.formatEther(bnbBal),
            bsc_usdc: bscUsdcBal,
            bsc_usdt: bscUsdtBal,
            pol: ethers.formatEther(polBal),
            pusd: pusdBal,
            vault_usdc: vaultBaseUsdc,
            vault_usdt: vaultBaseUsdt,
            vault_bnb: vaultBscBnb,
            vault_bsc_usdc: vaultBscUsdc,
            vault_bsc_usdt: vaultBscUsdt
        };
    }

    async getTokenBalance(address: string, tokenAddress: string, chain: Chain = 'base', knownDecimals?: number): Promise<string> {
        if (tokenAddress === "0x0000000000000000000000000000000000000000") {
            const provider = this.getProvider(chain);
            const balance = await provider.getBalance(address);
            return ethers.formatEther(balance);
        }
        const provider = this.getProvider(chain);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        try {
            if (knownDecimals !== undefined) {
                const balance = await contract.balanceOf(address);
                return ethers.formatUnits(balance, knownDecimals);
            }
            const [balance, decimals] = await Promise.all([
                contract.balanceOf(address),
                contract.decimals()
            ]);
            return ethers.formatUnits(balance, decimals);
        } catch (e: any) {
            console.warn(`[Wallet] Token balance fetch warning for ${tokenAddress} on ${chain}:`, e?.shortMessage || e?.message || e);
            return "0.0";
        }
    }

    async getVaultBalance(address: string, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const provider = this.getProvider(chain);
        const contractAddress = this.getContractAddress(chain);
        if (!contractAddress) return "0.0";

        const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);
        try {
            const balance = await contract.balances(address, tokenAddress);
            let decimals = 18;
            if (tokenAddress !== "0x0000000000000000000000000000000000000000") {
                const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
                decimals = await tokenContract.decimals();
            }
            return ethers.formatUnits(balance, decimals);
        } catch (e) {
            return "0.0";
        }
    }

    // ═══════════════════════════════════════
    //          TRANSFERS
    // ═══════════════════════════════════════

    async sendNative(userIndex: number, to: string, amount: string | number, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getUserSigner(userIndex, chain);
        const isBsc = chain === 'bsc';
        const txOptions: any = {};

        const tx = await signer.sendTransaction({
            to,
            value: ethers.parseUnits(amountStr, "ether"),
            ...txOptions
        });
        await tx.wait();
        return tx.hash;
    }

    async sendToken(userIndex: number, to: string, amount: string | number, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getUserSigner(userIndex, chain);
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const decimals = await contract.decimals();
        const isBsc = chain === 'bsc';
        const txOptions: any = {};

        const tx = await contract.transfer(to, ethers.parseUnits(amountStr, decimals), txOptions);
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
        if (!contractAddress) throw new Error(`Escrow contract not configured for ${chain}`);

        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const escrowContract = new ethers.Contract(contractAddress, ESCROW_ABI, signer);

        const isNative = tokenAddress === "0x0000000000000000000000000000000000000000";
        let decimals = 18;
        if (!isNative) {
            decimals = await tokenContract.decimals();
        }
        const amountUnits = ethers.parseUnits(amountStr, decimals);

        if (!isNative) {
            // 1. Smart Approve: Check existing allowance first
            const currentAllowance = await tokenContract.allowance(signer.address, contractAddress);
            if (currentAllowance < amountUnits) {
                console.log(`[WALLET] Insufficient allowance (${ethers.formatUnits(currentAllowance, decimals)}). Approving ${amount} ${tokenAddress}...`);

                const approveOptions: any = {};

                const approveTx = await tokenContract.approve(contractAddress, amountUnits, approveOptions);
                await approveTx.wait();

                // Small Sleep to mitigate RPC state lag on L2s like Base
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // 2. Deposit with Retry/Buffer for gas estimation lag
        let depositAttempts = 0;
        const maxDepositAttempts = 3;

        while (depositAttempts < maxDepositAttempts) {
            depositAttempts++;
            try {
                const txOptions: any = {
                    value: isNative ? amountUnits : 0
                };

                const depositTx = await escrowContract.deposit(tokenAddress, amountUnits, txOptions);
                await depositTx.wait();
                return depositTx.hash;
            } catch (err: any) {
                console.warn(`[WALLET] Deposit attempt ${depositAttempts} failed:`, err.message);

                if (depositAttempts >= maxDepositAttempts) throw err;

                // Transient Errors: Nonce, gas price spikes, or RPC state lag
                const isTransient = err.message.includes("allowance") ||
                    err.message.includes("estimateGas") ||
                    err.message.includes("nonce") ||
                    err.message.includes("replacement fee");

                if (isTransient) {
                    await new Promise(r => setTimeout(r, 2000 * depositAttempts));
                } else {
                    throw err;
                }
            }
        }
        throw new Error("Deposit failed after max retries");
    }

    async withdrawFromVault(userIndex: number, amount: string | number, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const amountStr = amount.toString();
        const signer = this.getUserSigner(userIndex, chain);
        const contractAddress = this.getContractAddress(chain);
        if (!contractAddress) throw new Error(`Escrow contract not configured for ${chain}`);
        const escrowContract = new ethers.Contract(contractAddress, ESCROW_ABI, signer);

        const isNative = tokenAddress === "0x0000000000000000000000000000000000000000";
        let decimals = 18;
        if (!isNative) {
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
            decimals = await tokenContract.decimals();
        }
        const amountUnits = ethers.parseUnits(amountStr, decimals);

        const txOptions: any = {};

        const tx = await escrowContract.withdraw(tokenAddress, amountUnits, txOptions);
        await tx.wait();

        return tx.hash;
    }

    async executeRawTransaction(userIndex: number, chain: Chain, to: string, data: string, value: string): Promise<string> {
        const signer = this.getUserSigner(userIndex, chain);
        const txOptions: any = {
            to,
            data,
            value: BigInt(value || "0")
        };
        const tx = await signer.sendTransaction(txOptions);
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
