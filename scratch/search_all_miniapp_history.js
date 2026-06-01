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
    const resources = new Set();

    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                const resource = data.resource || '';
                if (resource.includes('miniapp')) {
                    resources.add(resource);
                }
            } catch (err) {}
        }
    }

    console.log(`Found ${resources.size} unique miniapp resources in history:`);
    Array.from(resources).sort().forEach(r => console.log(`- ${r}`));
}

main();
