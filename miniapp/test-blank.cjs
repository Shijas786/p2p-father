const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.goto('http://localhost:5174/');
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    // try to navigate to /predict if not there
    const a = document.createElement('a');
    a.href = '/predict';
    a.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
