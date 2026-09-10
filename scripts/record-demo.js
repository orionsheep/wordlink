const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const FRAMES_DIR = path.join(__dirname, '..', 'temp_frames');
const OUT_VIDEO = path.join(__dirname, '..', 'docs', 'ambient-demo.mp4');
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
    let actualDuration = 36.5;

    console.log('🚀 正在启动 Chrome 进行影院级 1080P 演示视频录制...');
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

        // ==================== 1. 严格预加载保障机制 ====================
        console.log('⏳ 正在执行视频与资产预加载检测，确保无黑屏断流...');
        await send('Runtime.evaluate', {
            awaitPromise: true,
            expression: `
                new Promise((resolve) => {
                    const videos = Array.from(document.querySelectorAll('video'));
                    if (videos.length === 0) return setTimeout(resolve, 2500);

                    let readyCount = 0;
                    const checkDone = () => {
                        readyCount++;
                        if (readyCount >= Math.min(2, videos.length)) {
                            // 确保首个视频已经开始播放解码
                            const v0 = videos[0];
                            if (v0) v0.play().catch(() => {});
                            setTimeout(resolve, 1200);
                        }
                    };

                    videos.slice(0, 2).forEach((v) => {
                        if (v.readyState >= 3) checkDone();
                        else {
                            v.addEventListener('canplay', checkDone, { once: true });
                            v.addEventListener('loadeddata', checkDone, { once: true });
                            v.load();
                        }
                    });

                    // 兜底 5 秒最长等待
                    setTimeout(resolve, 5000);
                })
            `
        });
        console.log('✅ 视频与渲染管线已全部热启动就绪！');

        // ==================== 2. 启动帧录制 ====================
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

        await send('Page.startScreencast', {
            format: 'jpeg',
            quality: 94,
            maxWidth: 1920,
            maxHeight: 1080,
            everyNthFrame: 1,
        });
        const startTime = Date.now();
        console.log('🎥 录制已正式启动...');

        // ==================== 3. 舒缓从容的时间轴 ====================
        const timeline = [
            {
                t: 600,
                act: '快速优雅入场（轻触进入）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `document.querySelector('button')?.click();`,
                    }),
            },
            {
                t: 7500,
                act: '春季雪山 & 意境词沉浸欣赏完毕，平滑唤出控制条',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));`,
                    }),
            },
            {
                t: 9500,
                act: '打开宽幅选词与播放列表中心',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `document.querySelector('button[title="播放列表设置"]')?.click();`,
                    }),
            },
            {
                t: 13500,
                act: '切换到考纲题库（高中/四级 乱序）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('高中') || b.textContent.includes('四级'));
                            if (btn) btn.click();
                        `,
                    }),
            },
            {
                t: 17500,
                act: '演示精准词单勾选与过滤',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const cards = document.querySelectorAll('.grid > div');
                            if (cards[1]) cards[1].click();
                        `,
                    }),
            },
            {
                t: 21000,
                act: '点击「应用并开始沉浸」',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const applyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('应用并开始沉浸'));
                            if (applyBtn) applyBtn.click();
                        `,
                    }),
            },
            {
                t: 24500,
                act: '切换到秋季场景（🍁 枫叶与林海 1000ms 溶接）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const autumnBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('🍁') || b.title?.includes('Autumn'));
                                if (autumnBtn) autumnBtn.click();
                            }, 300);
                        `,
                    }),
            },
            {
                t: 30000,
                act: '切换到冬季场景（❄️ 极光雪夜与篝火）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const winterBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('❄️') || b.title?.includes('Winter'));
                                if (winterBtn) winterBtn.click();
                            }, 300);
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

        // 留白 5.5 秒展示冬季唯美收尾
        console.log('❄️ 正在录制冬季唯美落雪收尾...');
        await new Promise((r) => setTimeout(r, 5500));

        await send('Page.stopScreencast');
        ws.close();
        actualDuration = (Date.now() - startTime) / 1000;
        const actualFps = Math.max(12, Math.round((frameCount / actualDuration) * 10) / 10);
        console.log(`🎬 录制完成：用时 ${actualDuration.toFixed(1)}s，共捕获 ${frameCount} 帧，实际真实帧率：${actualFps} FPS。`);
    } finally {
        chrome.kill();
    }

    // ==================== 4. FFmpeg 压制（按真实录制时长精准匹配 1.0x 正常原速） ====================
    console.log('🎞️ 正在使用 FFmpeg 压制 1080P 影院级 MP4 视频（保持原速呼吸节奏）...');
    const calcFps = Math.max(12, (frameCount / actualDuration).toFixed(2));
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

    console.log(`✨ 视频已成功生成：${OUT_VIDEO}`);
    const stats = fs.statSync(OUT_VIDEO);
    console.log(`📦 视频文件大小：${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 清理临时帧
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
}

record().catch(console.error);
