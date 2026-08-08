const axios = require("axios");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.COMMUNITY_CHAT_ID || "-1003615663045";

const usersToCheck = [
  { name: "fahmmin", username: "@fahmmin", tg_id: 1140275006 },
  { name: "Abhi (User 1)", username: "@Abhi", tg_id: 629583279 },
  { name: "Abhi (User 2)", username: "Abhi", tg_id: 8867497258 },
  { name: "Abhi Carter", username: "@Abhi_Carter", tg_id: 1240279738 },
  { name: "Abhishek Pixel", username: "@abhishekpixelmedia", tg_id: 8340896477 }
];

async function checkMember(user) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${CHAT_ID}&user_id=${user.tg_id}`;
    const res = await axios.get(url);
    const data = res.data;
    if (data.ok) {
      const status = data.result.status;
      const isMember = ['creator', 'administrator', 'member', 'restricted'].includes(status);
      console.log(`[${user.name} (${user.username}, ID: ${user.tg_id})]: Status = ${status.toUpperCase()} -> ${isMember ? 'IN GROUP ✅' : 'NOT IN GROUP ❌'}`);
    } else {
      console.log(`[${user.name} (${user.username}, ID: ${user.tg_id})]: API Error -> ${data.description}`);
    }
  } catch (err) {
    if (err.response && err.response.data) {
      console.log(`[${user.name} (${user.username}, ID: ${user.tg_id})]: ${err.response.data.description} -> NOT IN GROUP ❌`);
    } else {
      console.log(`[${user.name} (${user.username}, ID: ${user.tg_id})]: Error: ${err.message}`);
    }
  }
}

async function main() {
  console.log(`Checking Telegram Group membership in Chat ID ${CHAT_ID}...`);
  for (const user of usersToCheck) {
    await checkMember(user);
  }
}

main();
