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

    console.log('🚀 启动 Chrome 录制 10.5s 紧凑高能「半词半文 + 拟态光标」Landing Page 闭环视频...');
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

        // 1. 预热视频与首帧渲染
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

        // 2. 注入高质感拟态光标系统
        console.log('✨ 注入高质感拟态光标动画系统...');
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    if (document.getElementById('virtual-cursor-layer')) return;
                    const style = document.createElement('style');
                    style.id = 'virtual-cursor-style';
                    style.innerHTML = \`
                        #virtual-cursor-layer {
                            position: fixed;
                            top: 0; left: 0; width: 100%; height: 100%;
                            pointer-events: none;
                            z-index: 999999;
                        }
                        #virtual-cursor {
                            position: absolute;
                            top: 0; left: 0;
                            width: 28px; height: 28px;
                            transform: translate(1400px, 800px);
                            transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
                            filter: drop-shadow(0 4px 14px rgba(0,0,0,0.7));
                        }
                        .cursor-click-ripple {
                            position: absolute;
                            top: 2px; left: 2px;
                            width: 24px; height: 24px;
                            border-radius: 50%;
                            border: 2px solid rgba(45, 212, 191, 0.95);
                            background: rgba(45, 212, 191, 0.25);
                            transform: scale(0.2);
                            opacity: 0;
                            pointer-events: none;
                            animation: cursor-ripple-pop 0.45s ease-out forwards;
                        }
                        @keyframes cursor-ripple-pop {
                            0% { transform: scale(0.2); opacity: 1; }
                            100% { transform: scale(2.4); opacity: 0; }
                        }
                    \`;
                    document.head.appendChild(style);

                    const layer = document.createElement('div');
                    layer.id = 'virtual-cursor-layer';
                    layer.innerHTML = \`
                        <div id="virtual-cursor">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M4.5 3.5L19.5 11.5L12 14.5L8.5 21.5L4.5 3.5Z" fill="#ffffff" stroke="#09090b" stroke-width="1.6" stroke-linejoin="round"/>
                            </svg>
                        </div>
                    \`;
                    document.body.appendChild(layer);

                    window.__moveCursor = (x, y) => {
                        const cur = document.getElementById('virtual-cursor');
                        if (cur) cur.style.transform = \`translate(\${x}px, \${y}px)\`;
                        window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
                    };

                    window.__clickBtn = (selectorOrFn) => {
                        const btn = typeof selectorOrFn === 'function' ? selectorOrFn() : document.querySelector(selectorOrFn);
                        if (btn) {
                            const r = btn.getBoundingClientRect();
                            const x = r.left + r.width / 2;
                            const y = r.top + r.height / 2;
                            window.__moveCursor(x, y);
                            const cur = document.getElementById('virtual-cursor');
                            if (cur) {
                                const rip = document.createElement('div');
                                rip.className = 'cursor-click-ripple';
                                cur.appendChild(rip);
                                setTimeout(() => rip.remove(), 500);
                            }
                            btn.click();
                        }
                    };
                })();
            `
        });

        // 3. 启动帧录制
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
        console.log('🎥 录制已启动（0s~4.5s 单词流，4.5s~9.5s 文章流，9.5s~10.5s 首尾溶接闭环）...');

        // ==================== 10.5s 黄金闭环时间轴 ====================
        const timeline = [
            // ── 前半段 (0s ~ 4.5s)：单词听力流 ──
            {
                t: 1000,
                act: '鼠标滑入控制条区域，唤出玻璃控件',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `window.__moveCursor(960, 960);`,
                    }),
            },
            {
                t: 2500,
                act: '鼠标平滑移至 [Read] 按钮悬停',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Read') || b.title?.includes('Reading'));
                            if (btn) {
                                const r = btn.getBoundingClientRect();
                                window.__moveCursor(r.left + r.width / 2, r.top + r.height / 2);
                            }
                        `,
                    }),
            },
            {
                t: 4200,
                act: '【⭐ 切换为文章模式】：鼠标点击 [Read]，波纹扩散，切入阅读',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Read') || b.title?.includes('Reading')));
                        `,
                    }),
            },
            // ── 后半段 (4.5s ~ 9.0s)：文章逐句朗读展示 + 换季溶接 ──
            {
                t: 6500,
                act: '鼠标移动到 🍁 金秋场景按钮并点击',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('🍁') || b.title?.includes('Autumn')));
                        `,
                    }),
            },
            {
                t: 8400,
                act: '鼠标移回 [Words] 按钮并点击，准备切回单词流',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Words') || b.title?.includes('Words')));
                        `,
                    }),
            },
            {
                t: 9400,
                act: '【⭐ 首尾闭环】：鼠标点击 🌸 初春场景，平滑溶接回第 1 帧开局雪山',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('🌸') || b.title?.includes('Spring')));
                            setTimeout(() => window.__moveCursor(1500, 1000), 300);
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

        // 留白 1.2 秒确保春季首帧状态完全无缝吻合
        await new Promise((r) => setTimeout(r, 1200));

        await send('Page.stopScreencast');
        ws.close();
        const actualDuration = (Date.now() - startTime) / 1000;
        console.log(`🎬 录制完成：实际用时 ${actualDuration.toFixed(1)}s，共捕获 ${frameCount} 帧。`);
    } finally {
        chrome.kill();
    }

    // ==================== FFmpeg 压制精准 10.5 秒 1080P MP4 ====================
    console.log('🎞️ 正在使用 FFmpeg 压制 10.5s 半词半文 + 拟态鼠标 1080P 影院级视频...');
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

    console.log(`✨ 10.5s 半词半文+拟态鼠标英雄区循环视频已成功生成：${OUT_VIDEO}`);
    const stats = fs.statSync(OUT_VIDEO);
    console.log(`📦 视频文件大小：${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 同步备份一份至 docs/ambient-landing-hero-10s.mp4
    fs.copyFileSync(OUT_VIDEO, path.join(__dirname, '..', 'docs', 'ambient-landing-hero-10s.mp4'));

    // 清理临时帧与测试脚本
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    if (fs.existsSync(path.join(__dirname, 'test-click.js'))) fs.unlinkSync(path.join(__dirname, 'test-click.js'));
    if (fs.existsSync(path.join(__dirname, 'debug-bar.js'))) fs.unlinkSync(path.join(__dirname, 'debug-bar.js'));
}

record().catch(console.error);
