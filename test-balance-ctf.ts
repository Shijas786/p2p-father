import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { polymarketService } from "./src/services/polymarket";
import { polymarketRelayerService } from "./src/services/relayer";

const PROXY_ADDRESS = "0xf20872C359788a53958a048413D64F183403B1f1"; // User proxy from screenshot
const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

const publicClient = createPublicClient({
  chain: polygon,
  transport: http("https://polygon-rpc.com"),
});

const ctfAbi = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" }
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

async function test() {
    const market = await polymarketService.getActiveBtcMarket();
    console.log("Market Tokens:", market.yesTokenId, market.noTokenId);

    const yesBal = await publicClient.readContract({
        address: CTF_CONTRACT,
        abi: ctfAbi,
        functionName: "balanceOf",
        args: [PROXY_ADDRESS, BigInt(market.yesTokenId)]
    });

    const noBal = await publicClient.readContract({
        address: CTF_CONTRACT,
        abi: ctfAbi,
        functionName: "balanceOf",
        args: [PROXY_ADDRESS, BigInt(market.noTokenId)]
    });

    console.log("YES Balance:", yesBal.toString());
    console.log("NO Balance:", noBal.toString());
}
test().catch(console.error);
