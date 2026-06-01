const fs = require('fs');
const path = require('path');

const baseDir = '/Users/shijas/Library/Application Support';
const ides = ['Cursor', 'Code'];

ides.forEach(ide => {
    const historyPath = path.join(baseDir, ide, 'User/History');
    if (fs.existsSync(historyPath)) {
        console.log(`\n=================== IDE: ${ide} ===================`);
        try {
            const subdirs = fs.readdirSync(historyPath);
            const resources = new Set();
            for (const subdir of subdirs) {
                const dirPath = path.join(historyPath, subdir);
                if (fs.statSync(dirPath).isDirectory()) {
                    const entriesJsonPath = path.join(dirPath, 'entries.json');
                    if (fs.existsSync(entriesJsonPath)) {
                        try {
                            const data = JSON.parse(fs.readFileSync(entriesJsonPath, 'utf8'));
                            if (data.resource) {
                                resources.add(data.resource);
                            }
                        } catch (e) {}
                    }
                }
            }
            console.log(`Total unique resources: ${resources.size}`);
            const sorted = Array.from(resources).sort();
            sorted.forEach(r => {
                if (r.includes('p2p') || r.includes('predict') || r.includes('Predict') || r.includes('miniapp')) {
                    console.log(`- ${r}`);
                }
            });
        } catch (err) {
            console.error(err);
        }
    } else {
        console.log(`IDE ${ide} history dir not found.`);
    }
});
