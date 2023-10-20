const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  console.log(await page.title()); // You can log the page title or other elements as a test
  await browser.close();
})();