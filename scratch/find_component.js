const fs = require('fs');
const path = require('path');

const bundlePath = '/Users/shijas/p2p father/miniapp/dist/assets/index-Dbr3qLne.js';

async function main() {
    if (!fs.existsSync(bundlePath)) {
        console.error("Bundle file does not exist.");
        return;
    }

    const content = fs.readFileSync(bundlePath, 'utf8');
    
    const pattern = 'function W6e(';
    const index = content.indexOf(pattern);
    
    if (index === -1) {
        console.log("Could not find pattern:", pattern);
        return;
    }

    console.log("Found 'function W6e(' at index", index);
    
    // Find the closing parenthesis of parameters list
    const closeParenIndex = content.indexOf(')', index + pattern.length);
    if (closeParenIndex === -1) {
        console.error("Could not find closing parenthesis.");
        return;
    }
    
    // Find the opening brace of function body after the closing parenthesis
    const openBraceIndex = content.indexOf('{', closeParenIndex);
    if (openBraceIndex === -1) {
        console.error("Could not find opening brace of body.");
        return;
    }

    // Now count braces starting from openBraceIndex
    let braceCount = 0;
    let endIndex = -1;
    for (let i = openBraceIndex; i < content.length; i++) {
        if (content[i] === '{') {
            braceCount++;
        } else if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i;
                break;
            }
        }
    }

    if (endIndex !== -1) {
        const fullFunc = content.substring(index, endIndex + 1);
        console.log(`Extracted W6e function of length: ${fullFunc.length} characters.`);
        fs.writeFileSync('/Users/shijas/p2p father/scratch/extracted_w6e.js', fullFunc);
        console.log("Saved function to: /Users/shijas/p2p father/scratch/extracted_w6e.js");
    } else {
        console.log("Could not find matching closing brace.");
    }
}

main();
