const fs = require('fs');
const path = require('path');

const historyDir = '/Users/shijas/Library/Application Support/Antigravity/User/History';

function getDirectories(srcpath) {
    if (!fs.existsSync(srcpath)) return [];
    return fs.readdirSync(srcpath)
        .map(file => path.join(srcpath, file))
        .filter(path => fs.statSync(path).isDirectory());
}

async function main() {
    const dirs = getDirectories(historyDir);
    let match = null;

    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                const resource = data.resource || '';
                if (resource.includes('pages/Market.tsx')) {
                    match = {
                        dir,
                        resource,
                        entries: data.entries || []
                    };
                    break;
                }
            } catch (err) {}
        }
    }

    if (match) {
        console.log(`Found Market.tsx history folder: ${match.dir}`);
        match.entries.forEach(e => {
            const date = new Date(e.timestamp);
            const exists = fs.existsSync(path.join(match.dir, e.id));
            console.log(`  - ID: ${e.id} | Date: ${date.toLocaleString()} | Exists: ${exists}`);
            
            // Save each version to scratch
            if (exists) {
                const content = fs.readFileSync(path.join(match.dir, e.id), 'utf8');
                const outPath = `/Users/shijas/p2p father/scratch/market_recovered_${e.id}.tsx`;
                fs.writeFileSync(outPath, content);
                console.log(`    Saved to: ${outPath}`);
            }
        });
    } else {
        console.log("No history found for Market.tsx.");
    }
}

main();
