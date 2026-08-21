const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1500,920']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 920 });

  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('currentWord', 'remain');
    localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify(['remain']));
    localStorage.setItem('dashboard_wordBrowsingIndex', '0');
    // ensure youtube_clips is not collapsed
    const cfg = JSON.parse(localStorage.getItem('wordlink_module_config') || '{}');
    if (cfg.collapsedModules) {
      cfg.collapsedModules.youtube_clips = false;
      localStorage.setItem('wordlink_module_config', JSON.stringify(cfg));
    }
  });

  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));

  await page.screenshot({ path: path.join(__dirname, '..', 'screenshot-youtube-module.png') });
  console.log('Saved screenshot-youtube-module.png');
  await browser.close();
})();
