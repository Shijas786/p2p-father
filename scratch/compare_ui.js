const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        // Go to polymarket
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto('https://polymarket.com', { waitUntil: 'networkidle2' });
        
        await page.screenshot({ path: '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/scratch/poly.png' });
        console.log('Polymarket screenshot taken');
        
        // Also go to the local app to compare
        try {
            await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
            await page.screenshot({ path: '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/scratch/local.png' });
            console.log('Local app screenshot taken');
        } catch (e) {
            console.log('Could not load local app. Is the dev server running on 5173?');
        }
        
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
