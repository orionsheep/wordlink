const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1600,1000'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  // 登录
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', 'demo@wordlink.test', { delay: 10 });
  await page.type('input[type="password"]', 'Demo2026!', { delay: 10 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}), page.keyboard.press('Enter')]);
  await new Promise(r => setTimeout(r, 4000));

  await page.goto('http://localhost:3000/immersive', { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 6000));
  const imm = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim().slice(0, 30)).filter(Boolean);
    return { buttons: btns.slice(0, 40), bodyClass: document.body.className };
  });
  console.log('IMMERSIVE buttons:', JSON.stringify(imm, null, 1));

  await page.goto('http://localhost:3000/navigator', { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 4000));
  const nav = await page.evaluate(() => {
    const input = document.querySelector('input');
    const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim().slice(0, 30)).filter(Boolean);
    return { inputPlaceholder: input?.placeholder, buttons: btns.slice(0, 20) };
  });
  console.log('NAVIGATOR:', JSON.stringify(nav, null, 1));
  await browser.close();
})();
