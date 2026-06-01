const fs = require('fs');
const path = require('path');

const folders = ['-2d6b341b', '-265dac8b', '5ec14147', '-67108fc6', '-5c399336', '-3e3034e4'];
const historyDir = '/Users/shijas/Library/Application Support/Antigravity/User/History';

async function main() {
    for (const folder of folders) {
        const entriesPath = path.join(historyDir, folder, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                console.log(`\nFolder: ${folder} | Resource: ${data.resource}`);
                (data.entries || []).forEach(e => {
                    const date = new Date(e.timestamp);
                    console.log(`  - ID: ${e.id} | Date: ${date.toLocaleString()}`);
                });
            } catch (err) {
                console.error(err);
            }
        } else {
            console.log(`Folder ${folder} entries.json not found.`);
        }
    }
}

main();
