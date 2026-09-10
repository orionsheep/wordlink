/**
 * 比赛申报证据截图采集器
 * 复用 capture-showcase.js 的登录/隐藏逻辑,独立输出到
 * ../00-比赛材料/submission/evidence/*.jpg,纯浏览不写库。
 *
 * 用法: node scripts/capture-evidence.js [--only name1,name2]
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = '/Users/mychanging/Desktop/澳门比赛/00-比赛材料/submission/evidence';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CREDS = { email: 'demo@wordlink.test', password: 'Demo2026!' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HIDE_CSS = `
  nextjs-portal { display: none !important; }
  a[aria-label="Back to home"], a[aria-label="回到欢迎页"] { display: none !important; }
`;

async function hideOverlays(page) {
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
  await page
    .evaluate(() => {
      // 兜底:按文本隐藏可能的悬浮返回按钮/固定定位小按钮
      for (const el of document.querySelectorAll('nextjs-portal')) el.style.display = 'none';
    })
    .catch(() => {});
}

// dashboard:分步滚到底触发懒加载,再回到顶部截取总览(趋势/正确率/统计卡所在的一屏)
async function dashboardAction(page) {
  await page.evaluate(async () => {
    const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = window.innerHeight * 0.8;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await sleepIn(400);
    }
  });
  await sleep(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1500);
}

// passport:等 "Aggregating" 加载文案消失(最多 20s)
async function passportAction(page) {
  await page
    .waitForFunction(() => !document.body.innerText.includes('Aggregating'), { timeout: 20000 })
    .catch(() => console.log('  ! passport: Aggregating 文案 20s 内未消失'));
  await sleep(2500);
}

// [输出文件名, 路径, 额外等待ms, 自定义action]
const PAGES = [
  ['evidence-01-home', '/home', 8000, null],
  ['evidence-02-dashboard', '/dashboard', 7000, dashboardAction],
  ['evidence-03-passport', '/passport', 3000, passportAction],
  ['evidence-04-quiz', '/quiz', 6000, null],
  ['evidence-05-immersive', '/immersive?word=abandon', 10000, null],
];

(async () => {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1].split(',').map((s) => s.trim()) : null;
  const pages = only ? PAGES.filter(([n]) => only.includes(n)) : PAGES;

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,1000', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

  // 强制英文 UI(next-intl cookie)
  await page.setCookie({ name: 'NEXT_LOCALE', value: 'en', domain: 'localhost', path: '/' });

  // 登录(走真实表单,种下会话 cookie)
  console.log('→ 打开登录页...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[type="email"], input:not([type="password"])', { timeout: 30000 });
  await page.type('input[type="email"], input:not([type="password"])', CREDS.email, { delay: 20 });
  await page.type('input[type="password"]', CREDS.password, { delay: 20 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    page.keyboard.press('Enter'),
  ]);
  await sleep(4000);
  console.log('→ 登录后位于:', page.url());
  // 登录后 locale 可能被会话覆盖,再补一次英文 cookie
  await page.setCookie({ name: 'NEXT_LOCALE', value: 'en', domain: 'localhost', path: '/' });

  for (const [name, route, wait, action] of pages) {
    try {
      console.log(`→ 截图 ${name} (${route})`);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 90000 });
      await hideOverlays(page);
      await sleep(wait);
      if (action) await action(page);
      await hideOverlays(page);
      await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
      console.log(`  ✓ ${name}.jpg`);
    } catch (e) {
      console.log(`  ✗ ${name} 失败: ${String(e).slice(0, 160)}`);
    }
  }

  await browser.close();
  console.log('✅ 证据截图采集完成 →', OUT);
})();
