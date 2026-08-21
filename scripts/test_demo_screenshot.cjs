const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const possiblePaths = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  const browserPath = possiblePaths.find(p => fs.existsSync(p));

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,1100']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100 });

  const htmlPath = 'file:///' + path.resolve('..', 'youtube-audio-video-modes-demo.html').replace(/\\/g, '/');
  console.log('Opening demo HTML at:', htmlPath);
  await page.goto(htmlPath, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  const shotPath = path.resolve('..', 'screenshot-youtube-modes-demo.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved demo screenshot to:', shotPath);

  await browser.close();
})();
