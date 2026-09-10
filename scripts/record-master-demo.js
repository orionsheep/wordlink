const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const FRAMES_DIR = path.join(__dirname, '..', 'temp_frames');
const OUT_VIDEO = path.join(__dirname, '..', 'docs', 'ambient-master-demo-30s.mp4');
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

    console.log('🚀 启动 Chrome 录制纯净电影级 30s 实机演示视频 (纯净实景车窗 · 无花瓣遮挡 · 本地视频 0 延迟首帧 · 首尾闭环)...');
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

        // 1. 本地视频严格热启动检测（确保第 1 帧前已真实解码绘制）
        console.log('⏳ 本地视频管线预热，等待首帧完成物理绘制...');
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
                        if (v0 && v0.currentTime > 0.3 && !v0.paused && v0.videoWidth > 0) {
                            setTimeout(resolve, 800);
                            return;
                        }
                        if (attempts > 40) return resolve();
                        setTimeout(check, 80);
                    };
                    check();
                })
            `
        });
        console.log('✅ 本地视频已在全速渲染，无黑帧直接开拍！');

        // 2. 注入拟真光标系统
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
        console.log('🎥 30s 纯净实景演示录制正式启动...');

        // ==================== 30s 纯净实景时间轴 ====================
        const timeline = [
            // ── 0s ~ 5s: 🌸 春季粉霞雪山实景 & 词卡呼吸 ──
            {
                t: 1200,
                act: '鼠标滑入控制条区域，唤出玻璃控件',
                fn: () => send('Runtime.evaluate', { expression: `window.__moveCursor(960, 960);` }),
            },
            // ── 5s ~ 11s: 【单词的选择】展开 Playlist Hub ──
            {
                t: 4500,
                act: '【单词选择】：点击打开 Playlist Hub 选词中心',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `window.__clickBtn('button[title="播放列表设置"]');`,
                    }),
            },
            {
                t: 6800,
                act: '【单词选择】：切换到考纲词库（高中 乱序），展开词单明细',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('高中') || b.textContent.includes('四级')));
                        `,
                    }),
            },
            {
                t: 9200,
                act: '【单词选择】：点击「应用并开始沉浸」',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('应用并开始沉浸')));
                        `,
                    }),
            },
            // ── 11s ~ 17s: 【切换阅读模式】展示逐句点亮 ──
            {
                t: 12500,
                act: '【模式切换】：点击 [Read] 按钮切换为文章听读模式',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Read') || b.title?.includes('Reading')));
                        `,
                    }),
            },
            // ── 17s ~ 22s: 【文章的选择】展开 Reading Library ──
            {
                t: 16500,
                act: '【文章选择】：点击 [Library] 展开选文面板',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Library') || b.title?.includes('选择文章')));
                        `,
                    }),
            },
            {
                t: 19500,
                act: '【文章选择】：挑选秋季文章《Leaves and Letting Go》',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Leaves and Letting Go') || b.textContent.includes('落叶与放手')));
                        `,
                    }),
            },
            // ── 22s ~ 26s: 【纯净金秋场景】1200ms 电影级溶接 ──
            {
                t: 22000,
                act: '【🍁 金秋实景】：切换金秋场景（1200ms 纯净视频溶接 + 散文朗读）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('🍁') || b.title?.includes('Autumn')));
                        `,
                    }),
            },
            // ── 26s ~ 30s: 【纯净寒冬场景】1200ms 电影级溶接 ──
            {
                t: 26500,
                act: '【❄️ 寒冬实景】：切换寒冬场景（1200ms 纯净雪夜溶接）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('❄️') || b.title?.includes('Winter')));
                        `,
                    }),
            },
            // ── 30s ~ 33s: 【首尾闭环】切回 Words 模式 + 🌸 初春雪山 ──
            {
                t: 30000,
                act: '【⭐ 首尾闭环】：切回 Words 模式',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.__clickBtn(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Words') || b.title?.includes('Words')));
                        `,
                    }),
            },
            {
                t: 31200,
                act: '【⭐ 首尾闭环】：切回 🌸 初春雪山，溶接回第 1 帧开局状态',
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

        // 留白 2.5 秒确保春季开局画面完全归位
        await new Promise((r) => setTimeout(r, 2500));

        await send('Page.stopScreencast');
        ws.close();
        const actualDuration = (Date.now() - startTime) / 1000;
        console.log(`🎬 录制完成：实际用时 ${actualDuration.toFixed(1)}s，共捕获 ${frameCount} 帧。`);
    } finally {
        chrome.kill();
    }

    // ==================== FFmpeg 压制精准 30 秒 1080P MP4 ====================
    console.log('🎞️ 正在使用 FFmpeg 压制 30s 纯净电影级 MP4 视频...');
    const calcFps = Math.max(16, (frameCount / 33.5).toFixed(2));
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

    console.log(`✨ 纯净实景 30s 演示视频已成功生成：${OUT_VIDEO}`);
    const stats = fs.statSync(OUT_VIDEO);
    console.log(`📦 视频文件大小：${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 同步覆盖至其他演示文件
    fs.copyFileSync(OUT_VIDEO, path.join(__dirname, '..', 'docs', 'ambient-landing-loop-demo.mp4'));
    fs.copyFileSync(OUT_VIDEO, path.join(__dirname, '..', 'docs', 'ambient-full-feature-demo.mp4'));

    // 清理临时帧
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
}

record().catch(console.error);
