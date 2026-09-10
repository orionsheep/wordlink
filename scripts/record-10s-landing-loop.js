const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const FRAMES_DIR = path.join(__dirname, '..', 'temp_frames');
const OUT_VIDEO = path.join(__dirname, '..', 'docs', 'ambient-10s-hero-loop.mp4');
const FFMPEG_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}

async function record() {
    if (fs.existsSync(FRAMES_DIR)) {
        fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(FRAMES_DIR, { recursive: true });

    let frameCount = 0;
    const targetDurationSec = 11.0;

    console.log('🚀 启动 Chrome 录制 10s 紧凑高能 Landing Page 英雄区首尾循环视频...');
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1920,1080',
        '--force-device-scale-factor=1',
        'http://localhost:3000/ambient'
    ]);

    try {
        await new Promise((r) => setTimeout(r, 2000));
        const list = await getJson('http://127.0.0.1:9222/json');
        const page = list.find((p) => p.type === 'page');
        if (!page) throw new Error('No page target');

        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res) => ws.on('open', res));

        let msgId = 1;
        function send(method, params = {}) {
            const id = msgId++;
            return new Promise((resolve) => {
                const handler = (raw) => {
                    const msg = JSON.parse(raw);
                    if (msg.id === id) {
                        ws.off('message', handler);
                        resolve(msg.result);
                    }
                };
                ws.on('message', handler);
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        // 预热视频与首帧渲染
        console.log('⏳ 预热视频与渲染管线...');
        await send('Runtime.evaluate', {
            awaitPromise: true,
            expression: `
                new Promise((resolve) => {
                    const videos = Array.from(document.querySelectorAll('video'));
                    videos.forEach((v) => {
                        v.muted = true;
                        v.play().catch(() => {});
                    });
                    let attempts = 0;
                    const check = () => {
                        attempts++;
                        const v0 = videos[0];
                        if (v0 && v0.currentTime > 0.4 && !v0.paused) return resolve();
                        if (attempts > 50) return resolve();
                        setTimeout(check, 100);
                    };
                    check();
                })
            `
        });

        // 启动高帧率抓帧
        ws.on('message', (raw) => {
            const msg = JSON.parse(raw);
            if (msg.method === 'Page.screencastFrame') {
                const { data, sessionId } = msg.params;
                frameCount++;
                const fname = `frame_${String(frameCount).padStart(5, '0')}.jpg`;
                fs.writeFileSync(path.join(FRAMES_DIR, fname), Buffer.from(data, 'base64'));
                ws.send(
                    JSON.stringify({
                        id: msgId++,
                        method: 'Page.screencastFrameAck',
                        params: { sessionId },
                    }),
                );
            }
        });

        const startTime = Date.now();
        await send('Page.startScreencast', {
            format: 'jpeg',
            quality: 95,
            maxWidth: 1920,
            maxHeight: 1080,
            everyNthFrame: 1,
        });
        console.log('🎥 10s 紧凑录制启动...');

        // ==================== 10s 紧凑节奏时间轴 ====================
        const timeline = [
            // 0s ~ 2.5s: 🌸 春季雪山词流
            {
                t: 2200,
                act: '唤出控制条，点击 [Read] 切入文章听读',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const readBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Read') || b.title?.includes('Reading'));
                                if (readBtn) readBtn.click();
                            }, 200);
                        `,
                    }),
            },
            // 2.5s ~ 5.0s: 展示文章大字听读，切入金秋
            {
                t: 4800,
                act: '切入金秋场景（🍁 枫叶与林海溶接）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const autumnBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('🍁') || b.title?.includes('Autumn'));
                                if (autumnBtn) autumnBtn.click();
                            }, 200);
                        `,
                    }),
            },
            // 5.0s ~ 7.5s: 切入寒冬
            {
                t: 7200,
                act: '切入寒冬场景（❄️ 极光雪夜与篝火）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const winterBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('❄️') || b.title?.includes('Winter'));
                                if (winterBtn) winterBtn.click();
                            }, 200);
                        `,
                    }),
            },
            // 7.5s ~ 10.5s: 首尾闭环，溶接回初春雪山
            {
                t: 9400,
                act: '首尾闭环：冬夜平滑溶接回初春雪山（🌸 Words 模式闭环）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const wordsBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Words') || b.title?.includes('Words'));
                                if (wordsBtn) wordsBtn.click();
                                const springBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('🌸') || b.title?.includes('Spring'));
                                if (springBtn) springBtn.click();
                            }, 200);
                        `,
                    }),
            },
        ];

        let lastT = 0;
        for (const item of timeline) {
            const delay = item.t - lastT;
            if (delay > 0) await new Promise((r) => setTimeout(r, delay));
            console.log(`⏱️ [${(item.t / 1000).toFixed(1)}s] ${item.act}`);
            try {
                await item.fn();
            } catch (e) {
                console.error('Step failed:', e);
            }
            lastT = item.t;
        }

        // 留白 1.6 秒等待春季首帧完全归位
        await new Promise((r) => setTimeout(r, 1600));

        await send('Page.stopScreencast');
        ws.close();
        const actualDuration = (Date.now() - startTime) / 1000;
        console.log(`🎬 录制完成：实际用时 ${actualDuration.toFixed(1)}s，共捕获 ${frameCount} 帧。`);
    } finally {
        chrome.kill();
    }

    // ==================== FFmpeg 压制精准 10.5 秒 1080P MP4 ====================
    console.log('🎞️ 正在使用 FFmpeg 压制 10s 紧凑循环 MP4 视频...');
    const calcFps = Math.max(16, (frameCount / 10.8).toFixed(2));
    const ffmpeg = spawn(FFMPEG_PATH, [
        '-y',
        '-framerate',
        String(calcFps),
        '-i',
        path.join(FRAMES_DIR, 'frame_%05d.jpg'),
        '-vf',
        'scale=1920:1080:flags=lanczos,format=yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '17',
        OUT_VIDEO,
    ]);

    await new Promise((resolve, reject) => {
        ffmpeg.stderr.on('data', (d) => process.stdout.write('.'));
        ffmpeg.on('close', (code) => {
            console.log('');
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}`));
        });
    });

    console.log(`✨ 10s 英雄区循环视频已成功生成：${OUT_VIDEO}`);
    const stats = fs.statSync(OUT_VIDEO);
    console.log(`📦 视频文件大小：${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 同步复制一份到 docs/ambient-landing-hero-10s.mp4
    fs.copyFileSync(OUT_VIDEO, path.join(__dirname, '..', 'docs', 'ambient-landing-hero-10s.mp4'));

    // 清理临时帧
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
}

record().catch(console.error);
