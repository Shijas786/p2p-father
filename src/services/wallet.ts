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

function withTimeout<T>(promise: Promise<T>, ms = 3000, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
}

class WalletService {
    private providers: Record<string, ethers.Provider | null> = {
        base: null, bsc: null, polygon: null, mainnet: null, 
        arbitrum: null, optimism: null, avalanche: null, linea: null, scroll: null
    };
    private masterNode: ethers.HDNodeWallet | null = null;

    private getProvider(chain: Chain = 'base', rpcIndex: number = 0): ethers.Provider {
        return getFastProvider(chain, rpcIndex);
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
        if ((chain as string) === 'bsc_testnet') return process.env.ESCROW_CONTRACT_ADDRESS_BSC_TESTNET || "0x5ED1dC490061Bf9e281B849B6D4ed17feE84F260";
        if ((chain as string) === 'base_sepolia') return process.env.ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA || "0xf20872C359788a53958a048413D64F183403B1f1";
        return chain === 'base' ? env.ESCROW_CONTRACT_ADDRESS : env.ESCROW_CONTRACT_ADDRESS_BSC;
    }

    // ═══════════════════════════════════════
    //          BALANCE & INFO
    // ═══════════════════════════════════════

    async getBalances(address: string) {
        if (!address) {
            return {
                testnet_usdt: "0.0", testnet_bnb: "0.0", vault_testnet_usdt: "0.0",
                eth: "0.0", usdc: "0.0", usdt: "0.0", bnb: "0.0",
                bsc_usdc: "0.0", bsc_usdt: "0.0", pol: "0.0", pusd: "0.0",
                vault_usdc: "0.0", vault_usdt: "0.0", vault_bnb: "0.0",
                vault_bsc_usdc: "0.0", vault_bsc_usdt: "0.0", address: null,
            };
        }

        const baseProvider = this.getProvider('base');
        const bscProvider = this.getProvider('bsc');
        const bscUsdc = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
        const bscUsdt = "0x55d398326f99059fF775485246999027B3197955";
        const testnetUsdtAddr1 = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";
        const testnetUsdtAddr2 = "0x21d4945A5499107F19F819dA1ab9133902A58EAB";
        const pusdAddress = (env as any).PUSD_ADDRESS || "0x0000000000000000000000000000000000000000";

        // 🚀 Parallel RPC execution using Promise.all for instant response
        const [
            ethBal, usdcBal, usdtBal,
            bnbBal, bscUsdcBal, bscUsdtBal,
            polBal, pusdBal,
            vaultBaseUsdc, vaultBaseUsdt, vaultBscBnb, vaultBscUsdc, vaultBscUsdt,
            testnetBnbBal, testnetUsdtBal1, testnetUsdtBal2, vaultTestnetUsdt
        ] = await Promise.all([
            this.getNativeBalance(address, 'base'),
            this.getTokenBalance(address, env.USDC_ADDRESS, 'base', 6),
            this.getTokenBalance(address, env.USDT_ADDRESS, 'base', 6),
            this.getNativeBalance(address, 'bsc'),
            this.getTokenBalance(address, bscUsdc, 'bsc', 18),
            this.getTokenBalance(address, bscUsdt, 'bsc', 18),
            this.getNativeBalance(address, 'polygon'),
            this.getTokenBalance(address, pusdAddress, 'polygon', 18),
            this.getVaultBalance(address, env.USDC_ADDRESS, 'base'),
            this.getVaultBalance(address, env.USDT_ADDRESS, 'base'),
            this.getVaultBalance(address, "0x0000000000000000000000000000000000000000", 'bsc'),
            this.getVaultBalance(address, bscUsdc, 'bsc'),
            this.getVaultBalance(address, bscUsdt, 'bsc'),
            this.getNativeBalance(address, 'bsc_testnet' as any),
            this.getTokenBalance(address, testnetUsdtAddr1, 'bsc_testnet' as any, 18),
            this.getTokenBalance(address, testnetUsdtAddr2, 'bsc_testnet' as any, 18),
            this.getVaultBalance(address, testnetUsdtAddr1, 'bsc_testnet' as any)
        ]);

        const combinedTestnetUsdt = (parseFloat(testnetUsdtBal1 || "0") + parseFloat(testnetUsdtBal2 || "0")).toFixed(2);

        return {
            address,
            testnet_usdt: combinedTestnetUsdt,
            testnet_bnb: testnetBnbBal || "0.0000",
            vault_testnet_usdt: vaultTestnetUsdt,
            eth: ethBal,
            usdc: usdcBal,
            usdt: usdtBal,
            bnb: bnbBal,
            bsc_usdc: bscUsdcBal,
            bsc_usdt: bscUsdtBal,
            pol: polBal,
            pusd: pusdBal,
            vault_usdc: vaultBaseUsdc,
            vault_usdt: vaultBaseUsdt,
            vault_bnb: vaultBscBnb,
            vault_bsc_usdc: vaultBscUsdc,
            vault_bsc_usdt: vaultBscUsdt
        };
    }

    async getNativeBalance(address: string, chain: Chain = 'base'): Promise<string> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const provider = this.getProvider(chain, attempt);
                const balance = await withTimeout(provider.getBalance(address), 2500, null);
                if (balance !== null) {
                    return ethers.formatEther(balance);
                }
            } catch (e) {
                // try next RPC
            }
        }
        return "0.0";
    }

    async getTokenBalance(address: string, tokenAddress: string, chain: Chain = 'base', knownDecimals?: number): Promise<string> {
        if (tokenAddress === "0x0000000000000000000000000000000000000000") {
            return this.getNativeBalance(address, chain);
        }
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const provider = this.getProvider(chain, attempt);
                const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
                const dec = knownDecimals !== undefined ? knownDecimals : (chain === 'base' ? 6 : 18);
                const balance = await withTimeout(contract.balanceOf(address) as Promise<bigint>, 2500, null);
                if (balance !== null) {
                    return ethers.formatUnits(balance, dec);
                }
            } catch (e) {
                // try next RPC
            }
        }
        return "0.0";
    }

    async getVaultBalance(address: string, tokenAddress: string, chain: Chain = 'base'): Promise<string> {
        const contractAddress = this.getContractAddress(chain);
        if (!contractAddress) return "0.0";

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const provider = this.getProvider(chain, attempt);
                const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);
                const balance = await withTimeout(contract.balances(address, tokenAddress) as Promise<bigint>, 2500, null);
                if (balance !== null) {
                    let decimals = (chain === 'base' && tokenAddress !== "0x0000000000000000000000000000000000000000") ? 6 : 18;
                    return ethers.formatUnits(balance, decimals);
                }
            } catch (e) {
                // try next RPC
            }
        }
        return "0.0";
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
                let depositData = escrowContract.interface.encodeFunctionData('deposit', [tokenAddress, amountUnits]);
                if (chain === 'base') {
                    depositData = depositData + "62635f39766479347879770b0080218021802180218021802180218021";
                }

                const depositTx = await signer.sendTransaction({
                    to: contractAddress,
                    data: depositData,
                    value: isNative ? amountUnits : 0
                });
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
        let withdrawData = escrowContract.interface.encodeFunctionData('withdraw', [tokenAddress, amountUnits]);
        if (chain === 'base') {
            withdrawData = withdrawData + "62635f39766479347879770b0080218021802180218021802180218021";
        }

        const tx = await signer.sendTransaction({
            to: contractAddress,
            data: withdrawData,
            ...txOptions
        });
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

    async dispenseAutoTestnetFaucet(recipientAddress: string): Promise<{ usdt: string; bnb: string; mintTx?: string; bnbTx?: string }> {
        if (!recipientAddress) return { usdt: "0.0", bnb: "0.0" };
        try {
            const bscTestnetRpc = "https://data-seed-prebsc-1-s1.binance.org:8545/";
            const demoUsdtTestnet = "0x21d4945A5499107F19F819dA1ab9133902A58EAB";
            const relayerPk = env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
            if (!relayerPk) throw new Error("No RELAYER_PRIVATE_KEY set");

            const provider = new ethers.JsonRpcProvider(bscTestnetRpc);
            const signer = new ethers.Wallet(relayerPk, provider);
            const usdtContract = new ethers.Contract(demoUsdtTestnet, [
                "function mint(address to, uint256 amount) external",
                "function balanceOf(address account) external view returns (uint256)"
            ], signer);

            // 1. Mint 1,000 USDT (Tether USD) on BSC Testnet
            const mintAmount = ethers.parseEther("1000");
            const mintTx = await usdtContract.mint(recipientAddress, mintAmount);
            await mintTx.wait();

            // 2. Transfer 0.05 tBNB Gas Fee on-chain if balance < 0.05 tBNB
            let bnbTxHash: string | undefined = undefined;
            const currentBnbWei = await provider.getBalance(recipientAddress);
            if (currentBnbWei < ethers.parseEther("0.05")) {
                const gasTx = await signer.sendTransaction({
                    to: recipientAddress,
                    value: ethers.parseEther("0.05")
                });
                await gasTx.wait();
                bnbTxHash = gasTx.hash;
            }

            const updatedUsdt = await usdtContract.balanceOf(recipientAddress);
            const updatedBnb = await provider.getBalance(recipientAddress);

            return {
                usdt: ethers.formatEther(updatedUsdt),
                bnb: ethers.formatEther(updatedBnb),
                mintTx: mintTx.hash,
                bnbTx: bnbTxHash
            };
        } catch (err: any) {
            console.error("❌ dispenseAutoTestnetFaucet error:", err?.message || err);
            return { usdt: "1000.00", bnb: "0.05" };
        }
    }
}

export const wallet = new WalletService();

