const fs = require('fs');

const srcPath = '/Users/shijas/p2p father/scratch/recovered_step_274_Predictor.tsx';
const destPath = '/Users/shijas/p2p father/scratch/pretty_recovered_274_Predictor.tsx';

try {
    let content = fs.readFileSync(srcPath, 'utf8');
    
    // Check if it's a JSON string
    if (content.trim().startsWith('"') && content.trim().endsWith('"')) {
        content = JSON.parse(content);
    } else {
        // Replace escaped newlines
        content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    
    fs.writeFileSync(destPath, content);
    console.log(`Successfully formatted and wrote file to: ${destPath}`);
    console.log(`File size: ${content.length} characters`);
} catch (e) {
    console.error("Error pretty printing file:", e.message);
}
