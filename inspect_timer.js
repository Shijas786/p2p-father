const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto('https://polymarket.com', { waitUntil: 'networkidle2' });
    
    // Evaluate in page to find timer elements and their computed styles
    const styles = await page.evaluate(() => {
        // Just find any element that looks like a timer digit
        // Polymarket uses specific classes, but we can search by text or just fetch all keyframes
        const styleSheets = Array.from(document.styleSheets);
        let keyframes = [];
        for (let sheet of styleSheets) {
            try {
                if (sheet.cssRules) {
                    for (let rule of sheet.cssRules) {
                        if (rule.type === CSSRule.KEYFRAMES_RULE) {
                            keyframes.push({
                                name: rule.name,
                                cssText: rule.cssText
                            });
                        }
                    }
                }
            } catch(e) { } // Cross-origin stylesheets will throw
        }
        return keyframes;
    });
    console.log(JSON.stringify(styles, null, 2));
    await browser.close();
})();
