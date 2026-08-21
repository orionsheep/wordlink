const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1500,1200']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1200 });

  const word = 'characteristic';
  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
  await page.evaluate((w) => {
    localStorage.setItem('currentWord', w);
    localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify([w]));
    localStorage.setItem('dashboard_wordBrowsingIndex', '0');
  }, word);
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Find the YouTube module button and click to expand
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const ytBtn = buttons.find(b => b.textContent && b.textContent.includes('YouTube'));
    if (ytBtn) {
      ytBtn.click();
    }
  });

  // Scroll down
  await page.evaluate(() => {
    const main = document.querySelector('main.overflow-y-auto');
    if (main) {
      main.scrollTop = 1500;
    }
  });
  await new Promise(r => setTimeout(r, 3500));

  const shotPath = path.join(__dirname, '..', 'screenshot-youtube-expanded.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved expanded YouTube screenshot to:', shotPath);

  await browser.close();
})();
