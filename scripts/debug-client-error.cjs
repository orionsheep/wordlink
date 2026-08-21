const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
  });

  page.on('pageerror', err => {
    console.error('[UNHANDLED PAGE ERROR]:', err.message);
    console.error(err.stack);
  });

  console.log('--- 1. Testing clean load on http://localhost:3000 ---');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- 2. Testing with various localStorage states ---');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- 3. Testing with word "characteristic" ---');
  await page.evaluate(() => {
    localStorage.setItem('currentWord', 'characteristic');
    localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify(['characteristic']));
    localStorage.setItem('dashboard_wordBrowsingIndex', '0');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- 4. Testing with word "abandon" ---');
  await page.evaluate(() => {
    localStorage.setItem('currentWord', 'abandon');
    localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify(['abandon']));
    localStorage.setItem('dashboard_wordBrowsingIndex', '0');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  await browser.close();
  console.log('Investigation finished.');
})();
