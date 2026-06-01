const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const gitObjectsDir = '/Users/shijas/p2p father/.git/objects';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else {
            results.push(filePath);
        }
    });
    return results;
}

async function main() {
    if (!fs.existsSync(gitObjectsDir)) {
        console.error("Git objects directory not found:", gitObjectsDir);
        return;
    }

    console.log("Scanning Git objects directory...");
    const files = walk(gitObjectsDir);
    console.log(`Found ${files.length} Git object files.`);

    const keywords = ['PRICE TO BEAT', 'placingBet', 'betOutcome', 'TradingView.widget'];
    let matchesCount = 0;

    files.forEach(file => {
        // Skip info and pack directories/files
        if (file.includes('/info/') || file.includes('/pack/')) return;

        try {
            const buffer = fs.readFileSync(file);
            const decompressed = zlib.inflateSync(buffer).toString('utf8');

            for (const kw of keywords) {
                if (decompressed.includes(kw)) {
                    matchesCount++;
                    const sha = path.basename(path.dirname(file)) + path.basename(file);
                    console.log(`\nFound match in Git object! SHA: ${sha}`);
                    console.log(`Size: ${decompressed.length} characters`);
                    console.log(`Keyword: ${kw}`);
                    
                    // Save to scratch
                    const outPath = `/Users/shijas/p2p father/scratch/git_recovered_${sha}.tsx`;
                    fs.writeFileSync(outPath, decompressed);
                    console.log(`Saved decompressed blob to: ${outPath}`);
                    break;
                }
            }
        } catch (e) {
            // Ignore decompression or reading errors for non-loose or corrupt objects
        }
    });

    console.log(`\nScan finished. Recovered ${matchesCount} matching blobs.`);
}

main();
