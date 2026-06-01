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
    console.log(`Scanning history directories for 'miniapp'...`);

    const mappings = [];
    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                if (data.resource && data.resource.includes('Predict')) {
                    mappings.push({
                        folder: path.basename(dir),
                        resource: data.resource,
                        count: (data.entries || []).length,
                        entries: data.entries || []
                    });
                }
            } catch (err) {}
        }
    }

    mappings.sort((a, b) => a.resource.localeCompare(b.resource));

    console.log(`Found ${mappings.length} matching files in miniapp history:`);
    mappings.forEach(m => {
        console.log(`\nFolder: ${m.folder} | Entries: ${m.count} | Resource: ${m.resource}`);
        m.entries.forEach(e => {
            const date = new Date(e.timestamp);
            console.log(`  - ID: ${e.id} | Date: ${date.toLocaleString()}`);
        });
    });
}

main();
