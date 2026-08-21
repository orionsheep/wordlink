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
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1500,920']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 920 });

  for (const word of ['remain', 'basic']) {
    console.log(`Testing word: ${word} in 3-column mode...`);
    await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
    await page.evaluate((w) => {
      localStorage.setItem('currentWord', w);
      localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify([w]));
      localStorage.setItem('dashboard_wordBrowsingIndex', '0');
    }, word);
    await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(__dirname, '..', `screenshot-${word}-3column.png`) });

    console.log(`Testing word: ${word} in immersive mode...`);
    await page.goto(`http://localhost:3001/immersive?word=${word}`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(__dirname, '..', `screenshot-${word}-immersive.png`) });
  }

  console.log('All screenshots captured successfully!');
  await browser.close();
})();
