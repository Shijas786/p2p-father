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
    console.log(`Found ${dirs.length} directories in Antigravity History.`);

    const resources = new Set();
    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                if (data.resource) {
                    resources.add(data.resource);
                }
            } catch (err) {}
        }
    }

    console.log(`Unique resources found: ${resources.size}`);
    const sorted = Array.from(resources).sort();
    sorted.forEach(r => {
        if (r.includes('p2p') || r.includes('Predict') || r.includes('predict') || r.includes('miniapp')) {
            console.log(`- ${r}`);
        }
    });
}

main();
