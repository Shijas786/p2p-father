const fs = require('fs');

const srcPath = '/Users/shijas/p2p father/scratch/extracted_w6e.js';
const destPath = '/Users/shijas/p2p father/scratch/beautified_w6e.tsx';

try {
    const content = fs.readFileSync(srcPath, 'utf8');
    
    // Simple beautifier: insert newlines after semicolons, opening/closing braces, and format JSX elements
    let formatted = content
        .replace(/;/g, ';\n')
        .replace(/{/g, '{\n')
        .replace(/}/g, '\n}\n')
        .replace(/,/g, ',\n')
        .replace(/const /g, '\nconst ')
        .replace(/function /g, '\nfunction ')
        .replace(/return /g, '\nreturn ');

    fs.writeFileSync(destPath, formatted);
    console.log(`Beautified code saved to: ${destPath}`);
} catch (e) {
    console.error("Error beautifying file:", e.message);
}
