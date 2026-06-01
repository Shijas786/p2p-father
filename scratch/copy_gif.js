const fs = require('fs');
const path = require('path');

const src = "/Users/shijas/Downloads/PixeLɑnd ◇.gif";
const dest = "/Users/shijas/p2p father/assets/deal_completed.gif";

try {
    fs.copyFileSync(src, dest);
    console.log("✅ Successfully copied GIF to assets/deal_completed.gif");
} catch (err) {
    console.error("❌ Failed to copy GIF:", err.message);
}
