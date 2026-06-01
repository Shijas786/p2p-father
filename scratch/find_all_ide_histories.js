const fs = require('fs');
const path = require('path');

const baseDir = '/Users/shijas/Library/Application Support';
const ideNames = ['Cursor', 'Code', 'Cursor - Nightly', 'VSCode', 'Antigravity'];

function findHistoryFiles() {
    ideNames.forEach(ide => {
        const historyPath = path.join(baseDir, ide, 'User/History');
        if (fs.existsSync(historyPath)) {
            console.log(`Checking history directory for IDE: ${ide}`);
            try {
                const subdirs = fs.readdirSync(historyPath);
                for (const subdir of subdirs) {
                    const dirPath = path.join(historyPath, subdir);
                    if (fs.statSync(dirPath).isDirectory()) {
                        const entriesJsonPath = path.join(dirPath, 'entries.json');
                        if (fs.existsSync(entriesJsonPath)) {
                            try {
                                const data = JSON.parse(fs.readFileSync(entriesJsonPath, 'utf8'));
                                const resource = data.resource || '';
                                if (resource.includes('Predict') || resource.includes('predict')) {
                                    console.log(`\nFound matching resource in ${ide}:`);
                                    console.log(`Resource: ${resource}`);
                                    console.log(`Path: ${dirPath}`);
                                    const entries = data.entries || [];
                                    entries.forEach(e => {
                                        const date = new Date(e.timestamp);
                                        console.log(`  - ID: ${e.id} | Date: ${date.toLocaleString()}`);
                                    });
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (err) {
                console.error(`Error reading ${historyPath}:`, err.message);
            }
        } else {
            console.log(`History directory not found for IDE: ${ide}`);
        }
    });
}

findHistoryFiles();
