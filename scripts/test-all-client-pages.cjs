const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const possiblePaths = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const browserPath = possiblePaths.find(p => fs.existsSync(p));

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const urls = [
    'http://localhost:3000/',
    'http://localhost:3000/login',
    'http://localhost:3000/quiz',
    'http://localhost:3000/immersive',
    'http://localhost:3000/my-libraries',
    'http://localhost:3000/word/abandon',
    'http://localhost:3000/word/characteristic',
  ];

  for (const u of urls) {
    const page = await browser.newPage();
    let hasError = false;
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`[${u}] Console Error:`, msg.text());
    });
    page.on('pageerror', err => {
      hasError = true;
      console.error(`[${u}] Page Error:`, err.message, err.stack);
    });

    try {
      await page.goto(u, { waitUntil: 'networkidle2', timeout: 10000 });
      if (!hasError) {
        console.log(`PASS [${u}]`);
      }
    } catch (e) {
      console.error(`FAIL [${u}]:`, e.message);
    }
    await page.close();
  }

  await browser.close();
})();
