const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  const edgePath = possiblePaths.find(p => fs.existsSync(p));
  console.log('Using browser at:', edgePath);

  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1920,1080']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const word = 'characteristic';
  console.log(`Testing word: ${word} in 3-column mode...`);
  
  await page.goto('http://localhost:3009', { waitUntil: 'domcontentloaded' });
  await page.evaluate((w) => {
    localStorage.setItem('currentWord', w);
    localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify([w]));
    localStorage.setItem('dashboard_wordBrowsingIndex', '0');
  }, word);
  
  // Reload to test refresh behavior
  await page.goto('http://localhost:3009', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  
  const shotPath = path.join(__dirname, '..', 'screenshot-characteristic-fixed.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved screenshot to:', shotPath);

  await browser.close();
})();
