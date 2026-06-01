const fs = require('fs');

const src = "/Users/shijas/Downloads/need_a_welcome_message_video_f (1).gif";
const dest = "/Users/shijas/p2p father/assets/welcome.gif";

try {
    fs.copyFileSync(src, dest);
    console.log("✅ Successfully copied Welcome GIF to assets/welcome.gif");
} catch (err) {
    console.error("❌ Failed to copy welcome GIF:", err.message);
}
