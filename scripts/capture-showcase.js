/**
 * 首页功能巡礼截图采集器 v3
 * 用真实网站(localhost:3000)自动登录后逐页截取暗色截图,
 * 输出到 public/images/showcase/*.jpg,供 LandingPage 功能巡礼区使用。
 *
 * v3 改进:
 *  - 隐藏 Next.js dev 指示器(nextjs-portal)与全局悬浮按钮(BackToHome/BackToWelcome)
 *  - 视口 1600x1000(16:10,比 1920x1080 更紧凑)
 *  - 逐页 zoom:让稀疏页面内容铺满画面
 *  - 逐页 action:navigator 真实跑一遍导航、immersive 带词进图谱、my-libraries 上传 CSV、passport 等聚合完成
 *  - 支持只跑单页: node scripts/capture-showcase.js --only study,quiz
 *
 * 用法: node scripts/capture-showcase.js [--only name1,name2]
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'public', 'images', 'showcase');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CREDS = { email: 'demo@wordlink.test', password: 'Demo2026!' };
const DEMO_CSV = path.join(__dirname, 'legacy', 'test-my-library.csv');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ACTIONS = {
  // 认知导航:真实输入目标词并点击 Navigate,等待链路图谱 + AI 解释渲染(serene 实测有 4 跳链路)
  navigator: async (page) => {
    await page.waitForSelector('input', { timeout: 30000 });
    await page.type('input', 'serene', { delay: 40 });
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Navigate');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) await page.keyboard.press('Enter');
    await sleep(15000);
  },
  // 护照:等待学习数据聚合完成(加载文案消失)
  passport: async (page) => {
    await page
      .waitForFunction(() => !document.body.innerText.includes('Aggregating'), { timeout: 45000 })
      .catch(() => {});
    await sleep(3000);
  },
  // 我的词库:走真实 Upload CSV 流程上传演示词库并确认
  'my-libraries': async (page) => {
    let input = await page.$('input[type="file"]');
    if (!input) {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /upload/i.test(b.textContent));
        if (btn) btn.click();
      });
      await sleep(1000);
      input = await page.$('input[type="file"]');
    }
    if (!input) return;
    await input.uploadFile(DEMO_CSV);
    await sleep(1200);
    // 词库名填一个展示友好的名字
    await page.evaluate(() => {
      const nameInput = [...document.querySelectorAll('input')].find((i) => i.type === 'text' && i.value.includes('test'));
      if (nameInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(nameInput, 'IELTS Core Sprint');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Upload');
      if (btn) btn.click();
    });
    await sleep(6000);
  },
};

// [输出文件名, 路径, 额外等待ms, zoom(内容放大系数)]
const PAGES = [
  ['home', '/home', 8000, 1.0],
  ['study', '/study', 9000, 1.0],
  ['navigator', '/navigator', 5000, 1.1],
  ['quiz', '/quiz', 6000, 1.3],
  ['immersive', '/immersive?word=abandon', 10000, 1.0],
  ['ambient', '/ambient', 9000, 1.0],
  ['read', '/read', 6000, 1.1],
  ['passport', '/passport', 3000, 1.1],
  ['dashboard', '/dashboard', 7000, 1.15],
  ['my-libraries', '/my-libraries', 4000, 1.1],
  ['settings', '/settings', 5000, 1.3],
];

const HIDE_CSS = `
  nextjs-portal { display: none !important; }
  a[aria-label="Back to home"], a[aria-label="回到欢迎页"] { display: none !important; }
`;

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

  // 登录（走真实表单,种下会话 cookie）
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

  for (const [name, route, wait, zoom] of pages) {
    try {
      console.log(`→ 截图 ${name} (${route}) zoom=${zoom}`);
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 90000 });
      await page.addStyleTag({ content: HIDE_CSS });
      if (zoom !== 1) {
        await page.evaluate((z) => {
          document.body.style.zoom = String(z);
        }, zoom);
      }
      await sleep(wait);
      if (ACTIONS[name]) await ACTIONS[name](page);
      // action 后 fixed 悬浮物可能重新出现,再隐藏一次
      await page.addStyleTag({ content: HIDE_CSS });
      await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
      console.log(`  ✓ ${name}.jpg`);
    } catch (e) {
      console.log(`  ✗ ${name} 失败: ${String(e).slice(0, 120)}`);
    }
  }

  await browser.close();
  console.log('✅ 截图采集完成 →', OUT);
})();
