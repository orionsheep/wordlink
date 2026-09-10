/**
 * 录制 Ambient 单词流模式 (Words Mode) 演示视频
 * - CDP Page.startScreencast 抓帧(1600x900 JPEG)
 * - ffmpeg 按帧时间戳合成 MP4(H.264, <30MB)
 * - 演示：液态玻璃单词浮层卡、交叉淡切进出场、四季切换、播放列表设置面板、鼠标流畅悬停操作
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT_DIR = path.join(__dirname, 'ambient-words-frames');
const OUT_MP4 = 'C:/Users/Administrator/Desktop/澳门比赛/ambient-words-demo.mp4';
const RECORD_MS = 48000;

(async () => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: 'new',
        args: [
            '--window-size=1600,900',
            '--autoplay-policy=no-user-gesture-required',
            '--enable-gpu-rasterization',
            '--disable-audio-output',
        ],
        defaultViewport: { width: 1600, height: 900 },
    });
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/ambient', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500)); // 等首张词卡浮现

    const cdp = await page.createCDPSession();
    const frames = [];
    let frameIdx = 0;
    const t0 = Date.now();

    cdp.on('Page.screencastFrame', async (ev) => {
        try {
            await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId });
        } catch { /* noop */ }
        const file = path.join(OUT_DIR, `f${String(frameIdx++).padStart(6, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(ev.data, 'base64'));
        frames.push({ file, ts: (Date.now() - t0) / 1000 });
    });

    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, everyNthFrame: 1, maxWidth: 1600, maxHeight: 900 });

    /** 平滑模拟鼠标划过(贝塞尔式分段移动) */
    async function glide(from, to, steps = 35, stepMs = 16) {
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const e = 0.5 - Math.cos(Math.PI * t) / 2; // easeInOut
            await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
            await new Promise(r => setTimeout(r, stepMs));
        }
    }

    const W = 1600, H = 900;
    let cur = { x: W / 2, y: 150 };
    // 起始: 触发音频策略解锁
    await page.mouse.click(W / 2, 150);

    const script = [
        // 1. 鼠标平滑划向中间的液态玻璃单词卡片
        { at: 3500, act: async () => { await glide(cur, { x: W * 0.5, y: H * 0.72 }); cur = { x: W * 0.5, y: H * 0.72 }; } },
        // 2. 点击单词卡片触发重读音效
        { at: 5500, act: async () => { await page.mouse.click(W * 0.5, H * 0.72); } },
        // 3. 鼠标划向底部控制条并悬停
        { at: 8000, act: async () => { await glide(cur, { x: W * 0.44, y: H * 0.955 }); cur = { x: W * 0.44, y: H * 0.955 }; } },
        // 4. 点击“下一个单词”按钮 (SkipForward)
        { at: 10000, act: async () => {
            const skipBtn = await page.$('button[aria-label="下一个单词"]');
            if (skipBtn) await skipBtn.click();
            else await page.mouse.click(W * 0.44, H * 0.955);
        }},
        // 5. 鼠标移开观察新词卡浮现
        { at: 13000, act: async () => { await glide(cur, { x: W * 0.75, y: H * 0.4 }); cur = { x: W * 0.75, y: H * 0.4 }; } },
        // 6. 鼠标划向季节切换胶囊栏
        { at: 17000, act: async () => { await glide(cur, { x: W * 0.62, y: H * 0.955 }); cur = { x: W * 0.62, y: H * 0.955 }; } },
        // 7. 点击切换到秋季 🍁
        { at: 19000, act: async () => {
            const autumnBtn = await page.$('button[title="Autumn"]');
            if (autumnBtn) await autumnBtn.click();
        }},
        // 8. 观察秋季视频与粒子溶接
        { at: 23000, act: async () => { await glide(cur, { x: W * 0.3, y: H * 0.35 }); cur = { x: W * 0.3, y: H * 0.35 }; } },
        // 9. 鼠标划向设置按钮并点击打开播放列表设置
        { at: 27000, act: async () => { await glide(cur, { x: W * 0.525, y: H * 0.955 }); cur = { x: W * 0.525, y: H * 0.955 }; } },
        { at: 29000, act: async () => {
            const settingsBtn = await page.$('button[aria-label="播放列表设置"]');
            if (settingsBtn) await settingsBtn.click();
        }},
        // 10. 在设置面板内滑动浏览
        { at: 31000, act: async () => { await glide(cur, { x: W * 0.5, y: H * 0.45 }); cur = { x: W * 0.5, y: H * 0.45 }; } },
        { at: 33500, act: async () => { await glide(cur, { x: W * 0.5, y: H * 0.65 }); cur = { x: W * 0.5, y: H * 0.65 }; } },
        // 11. 点击关闭设置面板
        { at: 36000, act: async () => {
            const closeBtn = await page.$('button[aria-label="关闭设置面板"], div.liquid-glass button.rounded-full');
            if (closeBtn) await closeBtn.click();
            else await page.mouse.click(W * 0.72, H * 0.18);
        }},
        // 12. 切换到冬季 ❄️
        { at: 38500, act: async () => {
            const winterBtn = await page.$('button[title="Winter"]');
            if (winterBtn) await winterBtn.click();
        }},
        // 13. 鼠标移到边缘静止，等待控件自动淡出，进入纯净屏保挂机状态
        { at: 41000, act: async () => { await glide(cur, { x: 10, y: 10 }); cur = { x: 10, y: 10 }; } },
    ];

    const startWait = Date.now();
    for (const s of script) {
        const wait = s.at - (Date.now() - startWait);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        try { await s.act(); } catch (e) { console.warn('act fail:', e.message); }
    }
    const elapsed = Date.now() - t0;
    const remain = RECORD_MS - elapsed;
    if (remain > 0) await new Promise(r => setTimeout(r, remain));

    await cdp.send('Page.stopScreencast');
    await browser.close();

    // 生成 ffconcat 列表(按帧时间戳计算时长)
    const listFile = path.join(OUT_DIR, 'list.txt');
    let lines = ['ffconcat version 1.0'];
    for (let i = 0; i < frames.length; i++) {
        const dur = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - frames[i].ts) : 0.2;
        lines.push(`file '${path.basename(frames[i].file)}'`);
        lines.push(`duration ${dur.toFixed(4)}`);
    }
    fs.writeFileSync(listFile, lines.join('\n'));
    console.log(`frames: ${frames.length}, span: ${(frames[frames.length - 1]?.ts || 0).toFixed(1)}s`);
})().catch(e => { console.error(e); process.exit(1); });
