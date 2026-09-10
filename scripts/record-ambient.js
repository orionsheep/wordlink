/**
 * 录制 Ambient 沉浸式阅读演示视频
 * - CDP Page.startScreencast 抓帧(1600x900 JPEG)
 * - ffmpeg 按帧时间戳合成 MP4(H.264, <30MB)
 * - 期间模拟真实鼠标移动/悬停/点击,验证并展示鼠标流畅度
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT_DIR = path.join(__dirname, 'ambient-frames');
const OUT_MP4 = 'C:/Users/Administrator/Desktop/澳门比赛/ambient-reading-demo.mp4';
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
    await page.goto('http://localhost:3000/ambient?mode=reading', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000)); // 等文章加载 + 首句浮现

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
    async function glide(from, to, steps = 40, stepMs = 16) {
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const e = 0.5 - Math.cos(Math.PI * t) / 2; // easeInOut
            await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
            await new Promise(r => setTimeout(r, stepMs));
        }
    }

    const W = 1600, H = 900;
    let cur = { x: W / 2, y: H / 2 };
    // 起始:先激活一次音频策略(点击空白处)
    await page.mouse.click(W / 2, 120);

    const script = [
        { at: 3000, act: async () => { await glide(cur, { x: W * 0.22, y: H * 0.28 }); cur = { x: W * 0.22, y: H * 0.28 }; } },
        { at: 7000, act: async () => { await glide(cur, { x: W * 0.78, y: H * 0.62 }); cur = { x: W * 0.78, y: H * 0.62 }; } },
        { at: 11000, act: async () => { await glide(cur, { x: W * 0.5, y: H * 0.86 }); cur = { x: W * 0.5, y: H * 0.86 }; } },
        { at: 15000, act: async () => { await glide(cur, { x: W * 0.5, y: H * 0.955 }); cur = { x: W * 0.5, y: H * 0.955 }; } },
        { at: 16500, act: async () => { await page.mouse.click(W * 0.5, H * 0.955); } }, // 下一句
        { at: 20000, act: async () => { await glide(cur, { x: W * 0.35, y: H * 0.2 }); cur = { x: W * 0.35, y: H * 0.2 }; } },
        { at: 24000, act: async () => { await glide(cur, { x: W * 0.65, y: H * 0.75 }); cur = { x: W * 0.65, y: H * 0.75 }; } },
        { at: 28000, act: async () => { await glide(cur, { x: W * 0.5, y: H * 0.955 }); cur = { x: W * 0.5, y: H * 0.955 }; } },
        { at: 29500, act: async () => { await page.mouse.click(W * 0.5, H * 0.955); } }, // 下一句
        { at: 33000, act: async () => { await glide(cur, { x: W * 0.15, y: H * 0.5 }); cur = { x: W * 0.15, y: H * 0.5 }; } },
        { at: 37000, act: async () => { await glide(cur, { x: W * 0.85, y: H * 0.35 }); cur = { x: W * 0.85, y: H * 0.35 }; } },
        { at: 41000, act: async () => { await glide(cur, { x: W / 2, y: H / 2 }); cur = { x: W / 2, y: H / 2 }; } },
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
