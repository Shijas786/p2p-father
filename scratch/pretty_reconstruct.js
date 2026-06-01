const fs = require('fs');
const path = require('path');

const srcPath = '/Users/shijas/p2p father/scratch/reconstructed_Predictor.tsx';
if (!fs.existsSync(srcPath)) {
    console.error("File does not exist!");
    process.exit(1);
}

let content = fs.readFileSync(srcPath, 'utf8');

// Decode JSON string if it starts with quote
if (content.startsWith('"') && content.endsWith('"')) {
    content = JSON.parse(content);
} else {
    // Replace literal \n with actual newlines
    content = content.replace(/\\n/g, '\n');
}

const destPath = '/Users/shijas/p2p father/scratch/pretty_reconstructed_Predictor.tsx';
fs.writeFileSync(destPath, content);
console.log(`Saved pretty reconstructed Predictor to ${destPath}`);
console.log(`Lines: ${content.split('\n').length}`);
console.log(`Size: ${content.length} characters`);
