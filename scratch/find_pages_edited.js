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
    const pages = new Map();

    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                const resource = data.resource || '';
                if (resource.includes('miniapp/src/pages/')) {
                    pages.set(resource, {
                        dir,
                        count: (data.entries || []).length,
                        entries: data.entries || []
                    });
                }
            } catch (err) {}
        }
    }

    console.log(`Found ${pages.size} pages in history under miniapp/src/pages/:`);
    const sortedResources = Array.from(pages.keys()).sort();
    sortedResources.forEach(res => {
        const info = pages.get(res);
        console.log(`\nResource: ${res}`);
        console.log(`Entries: ${info.count}`);
        info.entries.forEach(e => {
            const date = new Date(e.timestamp);
            console.log(`  - ID: ${e.id} | Date: ${date.toLocaleString()}`);
        });
    });
}

main();
