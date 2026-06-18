const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('🚀 Launching chromium browser...');
    const browser = await chromium.launch({ headless: true });
    
    // Set a mobile-like viewport for the Telegram Mini App feel (375x667 or 390x844)
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2, // High resolution screenshots
    });
    const page = await context.newPage();

    const outputDir = path.join(__dirname, '..', 'public', 'assets', 'guide');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
        // --- SCREEN 1: Wallet Selector ---
        console.log('📸 Navigating to Wallet Selector (via forcing walletChosen=false)...');
        // We will make sure the code is modified so it doesn't auto-skip, or we reload.
        // Let's open the page
        await page.goto('http://localhost:5173/');
        await page.waitForTimeout(2000); // Wait for load
        
        // If we are already logged in, let's navigate to /profile, click switch wallet, and get the selector
        const isProfileOn = await page.evaluate(() => window.location.pathname.includes('/profile'));
        if (!isProfileOn) {
            await page.goto('http://localhost:5173/profile');
            await page.waitForTimeout(2000);
        }
        
        // Click the "Switch Wallet" button if it exists
        const switchBtn = await page.$('text=Switch Wallet');
        if (switchBtn) {
            console.log('Found Switch Wallet button. Clicking it to reveal Selector...');
            await switchBtn.click();
            await page.waitForTimeout(2000);
        }

        // Now capture the wallet selector page
        await page.screenshot({ path: path.join(outputDir, 'wallet_selector.png') });
        console.log('✅ Captured wallet_selector.png');

        // Choose Bot Wallet to proceed
        const botWalletBtn = await page.$('text=Bot Wallet');
        if (botWalletBtn) {
            console.log('Clicking Bot Wallet to authenticate...');
            await botWalletBtn.click();
            await page.waitForTimeout(2000);
        }

        // --- SCREEN 2: Wallet Page (Balances & Top Up) ---
        console.log('📸 Navigating to Wallet Page...');
        await page.goto('http://localhost:5173/wallet');
        await page.waitForTimeout(3000); // Wait for balances to load
        await page.screenshot({ path: path.join(outputDir, 'wallet_page.png') });
        console.log('✅ Captured wallet_page.png');

        // --- SCREEN 3: Profile Settings ---
        console.log('📸 Navigating to Profile Settings Page...');
        await page.goto('http://localhost:5173/profile');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(outputDir, 'profile_page.png') });
        console.log('✅ Captured profile_page.png');

        // --- SCREEN 4: Create Ad ---
        console.log('📸 Navigating to Create Ad Page...');
        await page.goto('http://localhost:5173/create');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(outputDir, 'create_ad_page.png') });
        console.log('✅ Captured create_ad_page.png');

        // --- SCREEN 5: Trade Detail (P2P Execution) ---
        console.log('📸 Navigating to Trade Detail Page...');
        await page.goto('http://localhost:5173/trade/demo-order-1');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(outputDir, 'trade_detail_page.png') });
        console.log('✅ Captured trade_detail_page.png');

    } catch (err) {
        console.error('❌ Error during capture:', err);
    } finally {
        await browser.close();
        console.log('🏁 Browser closed.');
    }
}

run();
