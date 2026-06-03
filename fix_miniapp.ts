import fs from 'fs';
let content = fs.readFileSync('src/api/miniapp.ts', 'utf8');

// Find the block at the beginning
const withdrawBlockRegex = /\/\/ Withdraw\napp\.post\("\/miniapp\/withdraw", async \(req: Request, res: Response\) => \{[\s\S]*?\}\);\n/m;
const match = content.match(withdrawBlockRegex);

if (match) {
    let block = match[0];
    content = content.replace(block, "");
    
    // Change 'app.post("/miniapp/withdraw"' to 'router.post("/withdraw"' since the router is likely mounted at /miniapp
    block = block.replace('app.post("/miniapp/withdraw"', 'router.post("/withdraw"');

    // Insert after 'const router = Router();'
    content = content.replace('const router = Router();', 'const router = Router();\n\n' + block);
    
    fs.writeFileSync('src/api/miniapp.ts', content);
    console.log("Moved withdraw route in miniapp.ts");
} else {
    console.log("Withdraw block not found");
}

let relayerContent = fs.readFileSync('src/services/relayer.ts', 'utf8');
if (!relayerContent.includes('import { getClient }')) {
    relayerContent = 'import { getClient } from "@relayprotocol/relay-sdk";\n' + relayerContent;
    fs.writeFileSync('src/services/relayer.ts', relayerContent);
    console.log("Added getClient import to relayer.ts");
}
