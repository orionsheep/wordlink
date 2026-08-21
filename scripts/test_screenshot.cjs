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

  if (!edgePath) {
    console.error('No browser executable found!');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1500,920']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 920 });

  console.log('Navigating to localhost:3001...');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });

  // Set currentWord to basic
  await page.evaluate(() => {
    localStorage.setItem('currentWord', 'basic');
    localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify(['basic']));
    localStorage.setItem('dashboard_wordBrowsingIndex', '0');
  });

  await page.reload({ waitUntil: 'networkidle0' });
  console.log('Waiting for force graph simulation to settle...');
  await new Promise(r => setTimeout(r, 3000));

  const outputPath = path.join(__dirname, '..', 'screenshot-basic-3column.png');
  await page.screenshot({ path: outputPath });
  console.log('Saved screenshot to:', outputPath);

  // Also take a screenshot of /immersive
  console.log('Navigating to /immersive?word=basic...');
  await page.goto('http://localhost:3001/immersive?word=basic', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));
  const immersiveOutputPath = path.join(__dirname, '..', 'screenshot-basic-immersive.png');
  await page.screenshot({ path: immersiveOutputPath });
  console.log('Saved immersive screenshot to:', immersiveOutputPath);

  await browser.close();
})();
