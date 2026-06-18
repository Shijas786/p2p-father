import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    console.log('🚀 Launching chromium browser with no-proxy...');
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--no-proxy-server']
    });
    
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000); // 15 seconds

    const outputDir = path.join(__dirname, '..', 'public', 'assets', 'guide');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        // --- SCREEN 1: Wallet Selector ---
        console.log('📸 Navigating to Home (127.0.0.1:5174)...');
        try {
            await page.goto('http://127.0.0.1:5174/', { waitUntil: 'domcontentloaded' });
        } catch (e) {
            console.log('Ignore navigation error:', e.message);
        }
        
        console.log('Waiting for #root...');
        await page.waitForSelector('#root', { timeout: 8000 });
        await page.waitForTimeout(2000); 

        // Take screen
        await page.screenshot({ path: path.join(outputDir, 'wallet_selector.png') });
        console.log('✅ Captured wallet_selector.png');

        // Click Bot Wallet
        const botWalletBtn = await page.$('text=Bot Wallet');
        if (botWalletBtn) {
            console.log('Clicking Bot Wallet...');
            await botWalletBtn.click();
            await page.waitForTimeout(2000);
        }

        // --- SCREEN 2: Wallet Page ---
        console.log('📸 Navigating to Wallet Page...');
        try {
            await page.goto('http://127.0.0.1:5174/wallet', { waitUntil: 'domcontentloaded' });
        } catch (e) {
            console.log('Ignore navigation error:', e.message);
        }
        await page.waitForSelector('#root');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(outputDir, 'wallet_page.png') });
        console.log('✅ Captured wallet_page.png');

        // --- SCREEN 3: Profile Settings ---
        console.log('📸 Navigating to Profile Page...');
        try {
            await page.goto('http://127.0.0.1:5174/profile', { waitUntil: 'domcontentloaded' });
        } catch (e) {
            console.log('Ignore navigation error:', e.message);
        }
        await page.waitForSelector('#root');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(outputDir, 'profile_page.png') });
        console.log('✅ Captured profile_page.png');

        // --- SCREEN 4: Create Ad ---
        console.log('📸 Navigating to Create Ad Page...');
        try {
            await page.goto('http://127.0.0.1:5174/create', { waitUntil: 'domcontentloaded' });
        } catch (e) {
            console.log('Ignore navigation error:', e.message);
        }
        await page.waitForSelector('#root');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(outputDir, 'create_ad_page.png') });
        console.log('✅ Captured create_ad_page.png');

        // --- SCREEN 5: Trade Detail ---
        console.log('📸 Navigating to Trade Page...');
        try {
            await page.goto('http://127.0.0.1:5174/trade/demo-order-1', { waitUntil: 'domcontentloaded' });
        } catch (e) {
            console.log('Ignore navigation error:', e.message);
        }
        await page.waitForSelector('#root');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(outputDir, 'trade_detail_page.png') });
        console.log('✅ Captured trade_detail_page.png');

    } catch (err) {
        console.error('❌ Critical Error during capture:', err);
    } finally {
        await browser.close();
        console.log('🏁 Browser closed.');
    }
}

run();
