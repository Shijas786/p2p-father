import { ethers } from "ethers";
import "dotenv/config";

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const walletAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
    
    // CTF contract address on Polygon
    const ctfAddress = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045"); // Conditional Tokens contract address
    
    const abi = [
        "function balanceOf(address owner, uint256 id) view returns (uint256)"
    ];
    
    const contract = new ethers.Contract(ctfAddress, abi, provider);
    
    const assets = [
        { title: "June 6, 9:05AM-9:10AM ET (Up)", id: "79034673394698934069508620534981622516536826004562727688731924561047591297234" },
        { title: "June 6, 1:15PM-1:20PM ET (Down)", id: "18733146719935401791291786998764724517835287538850440992206668848407005084530" },
        { title: "June 6, 5:15PM-5:20PM ET (Down)", id: "33400324046256100156116334454112361006523984045869750387835925721904599558693" },
        { title: "June 5, 1:40PM-1:45PM ET (Up)", id: "108951817423674586113442807492942680240028662659640361429626775851708615886974" },
        { title: "June 5, 10:45AM-10:50AM ET (Up)", id: "40044848836325987595444298631329411774778066892452046809721126974704176444835" },
        { title: "June 6, 5:25AM-5:30AM ET (Down)", id: "111786863242722270509464361483710598545377847391359909119723824601851670755499" },
        { title: "June 5, 6:30AM-6:35AM ET (Up)", id: "33250116742298679644540602837189097959731501018111783299824290497647951127605" },
        { title: "June 5, 9:25AM-9:30AM ET (Up)", id: "5310943958246785509766347569511112137265385145843754507617660752512933009423" },
        { title: "June 5, 5:40AM-5:45AM ET (Down)", id: "95732986988534195870429394672411279395357954064744961072957098441858918229160" },
        { title: "June 4, 7:00PM-7:05PM ET (Down)", id: "52909724298418672512640701856956649350330426605454529749890561919680359127870" },
        { title: "June 6, 9:20AM-9:25AM ET (Up)", id: "38188207649705150626714072676604841248788109466711571278643891849006219601459" },
        { title: "June 6, 5:15PM-5:20PM ET (Up)", id: "109316816842077714731295968553913336757743417057287852412733730953794523765362" }
    ];
    
    console.log("Checking on-chain balances for each asset...");
    for (const asset of assets) {
        try {
            const balance = await contract.balanceOf(walletAddress, asset.id);
            const amt = ethers.formatUnits(balance, 6);
            console.log(`- ${asset.title}: Balance = ${amt} shares`);
        } catch (e: any) {
            console.error(`Failed to get balance for ${asset.title}:`, e.message);
        }
    }
}

main().catch(console.error);
