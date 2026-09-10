/**
 * M1 核心演示视频录制器 v3(预热式分段录制)
 * 每个镜头: 先打开页面等完全就绪(不录),再开 CDP 抓帧只录交互动作 → 零加载画面/零黑屏/零黑边。
 * 分段 mp4 由 ffmpeg concat 合成,输出 public/videos/featured-demo.mp4。
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3000';
const WORK = '/tmp/m1_frames';
const OUT = path.join(__dirname, '..', 'public', 'videos', 'featured-demo.mp4');
const CREDS = { email: 'demo@wordlink.test', password: 'Demo2026!' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 镜头定义: [输出名, 路由, 预热ms, 录制ms, 交互函数]
const SHOTS = [
    { name: 'study', route: '/study', pre: 12000, rec: 16000, act: async (p) => {
        await p.mouse.move(1350, 400, { steps: 30 });
        for (let y = 0; y < 400; y += 50) { await p.evaluate((d) => window.scrollBy(0, d), 50); await sleep(70); }
        for (let y = 0; y < 400; y += 50) { await p.evaluate((d) => window.scrollBy(0, -d), 50); await sleep(50); }
    } },
    { name: 'quizhub', route: '/quiz', pre: 8000, rec: 14000, act: async (pg) => {
        try {
            const inp = await pg.$('input:not([type="hidden"]):not([type="email"])');
            if (inp) { await inp.type('abandon', { delay: 130 }); await sleep(900); await p.keyboard.press('Enter'); await sleep(3500); }
        } catch (e) {}
    } },
    { name: 'dashboard', route: '/dashboard', pre: 9000, rec: 12000, act: async (p) => {
        for (let y = 0; y < 600; y += 60) { await p.evaluate((d) => window.scrollBy(0, d), 60); await sleep(80); }
    } },
    { name: 'passport', route: '/passport', pre: 9000, rec: 11000, act: async (p) => {
        for (let y = 0; y < 400; y += 60) { await p.evaluate((d) => window.scrollBy(0, d), 60); await sleep(80); }
    } },
    { name: 'ambient', route: '/ambient', pre: 9000, rec: 10000, act: async () => { /* 纯氛围镜头 */ } },
];

(async () => {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
    const browser = await puppeteer.launch({
        executablePath: CHROME, headless: 'new',
        args: ['--no-sandbox', '--window-size=1920,1080', '--force-color-profile=srgb', '--hide-scrollbars'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

    // 登录(不录)
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input', { timeout: 30000 });
    await page.type('input[type="email"], input:not([type="password"])', CREDS.email, { delay: 15 });
    await page.type('input[type="password"]', CREDS.password, { delay: 15 });
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
        page.keyboard.press('Enter'),
    ]);
    await sleep(4000);
    console.log('→ 登录完成');

    const segFiles = [];
    let gFrame = 0;

    for (const shot of SHOTS) {
        // 预热:加载页面到完全就绪(不录)
        await page.goto(`${BASE}${shot.route}`, { waitUntil: 'networkidle2', timeout: 90000 });
        await sleep(shot.pre);
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(400);
        // 注入演示光标(青色圆环),保证画面持续变化
        await page.evaluate(() => {
            const c = document.createElement('div');
            c.id = 'demoCursor';
            c.style.cssText = 'position:fixed;z-index:999999;width:22px;height:22px;border:2.5px solid rgba(103,232,249,.95);border-radius:50%;box-shadow:0 0 14px rgba(103,232,249,.8);pointer-events:none;left:40%;top:40%;transition:left .28s linear,top .28s linear;';
            document.body.appendChild(c);
        });
        await sleep(300);

        const frames = [];
        const cdp = await page.createCDPSession();
        let lastTs = null;
        const onFrame = async (ev) => {
            const f = path.join(WORK, `g_${String(gFrame).padStart(6, '0')}.jpg`);
            fs.writeFileSync(f, Buffer.from(ev.data, 'base64'));
            const now = Date.now();
            frames.push({ f, dur: lastTs === null ? 120 : Math.min(Math.max(now - lastTs, 25), 1500) });
            lastTs = now; gFrame++;
            await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
        };
        cdp.on('Page.screencastFrame', onFrame);
        await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

        console.log(`● 录制镜头 ${shot.name} (${shot.rec}ms)`);
        // 编舞:光标正弦巡游 + 周期性滚轮,保证画面持续变化
        const dance = (async () => {
            const t0 = Date.now();
            let i = 0;
            while (Date.now() - t0 < shot.rec + 60000) {
                const x = 960 + 620 * Math.sin(i * 0.35);
                const y = 480 + 260 * Math.cos(i * 0.22);
                await page.evaluate((x, y) => {
                    const c = document.getElementById('demoCursor');
                    if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; }
                }, x, y).catch(() => {});
                if (i % 3 === 0) { await page.mouse.wheel(0, 120).catch(() => {}); }
                if (i % 7 === 3) { await page.mouse.wheel(0, -180).catch(() => {}); }
                await sleep(280);
                i++;
            }
        })();
        try { if (shot.act) await shot.act(page); } catch (e) { console.log('  交互提示:', String(e).slice(0, 60)); }
        const minEnd = Date.now() + shot.rec - 6000;
        while (Date.now() < minEnd) await sleep(200);
        await sleep(400);
        await cdp.send('Page.stopScreencast').catch(() => {});
        await sleep(300);
        try { cdp.off('Page.screencastFrame', onFrame); await cdp.detach(); } catch (e) {}

        const seg = path.join(WORK, `seg_${shot.name}.mp4`);
        const list = path.join(WORK, `list_${shot.name}.txt`);
        let txt = '';
        for (const fr of frames) txt += `file '${path.basename(fr.f)}'\nduration ${fr.dur / 1000}\n`;
        if (frames.length) txt += `file '${path.basename(frames[frames.length - 1].f)}'\n`;
        fs.writeFileSync(list, txt);
        execSync(`ffmpeg -y -v error -f concat -safe 0 -i "${list}" -vf "scale=1920:1080:flags=lanczos,format=yuv420p" -c:v libx264 -preset medium -crf 22 -r 30 "${seg}"`, { cwd: WORK });
        segFiles.push(seg);
        console.log(`  ✓ ${shot.name}: ${frames.length} 帧`);
    }
    await browser.close();

    const concatList = path.join(WORK, 'concat_all.txt');
    fs.writeFileSync(concatList, segFiles.map((f) => `file '${f}'\n`).join(''));
    console.log('→ ffmpeg 合成全片...');
    execSync(`ffmpeg -y -v error -f concat -safe 0 -i "${concatList}" -c:v libx264 -preset medium -crf 22 -r 30 "${OUT}"`, { cwd: WORK });
    const kb = Math.round(fs.statSync(OUT).size / 1024);
    console.log(`✅ 完成: ${OUT} (${kb} KB, ${segFiles.length} 镜头)`);
})().catch((e) => { console.error('录制失败:', e); process.exit(1); });
