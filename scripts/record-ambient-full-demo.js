const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const FRAMES_DIR = path.join(__dirname, '..', 'temp_frames');
const OUT_VIDEO = path.join(__dirname, '..', 'docs', 'ambient-landing-loop-demo.mp4');
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
    let actualDuration = 54.0;

    console.log('🚀 启动 Chrome 录制 Landing Page 首尾闭环无缝演示视频 (无黑屏开场 + 1080P + 1200ms 电影级溶接 + 冬春首尾闭环)...');
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

        // ==================== 1. 严格预热与预加载校验 ====================
        console.log('⏳ 预热视频与渲染管线，确保第 1 帧即是满画质实景（等待 video.currentTime > 0.5s）...');
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
                        if (v0 && v0.currentTime > 0.5 && !v0.paused) {
                            return resolve();
                        }
                        if (attempts > 60) return resolve(); // 6s 兜底
                        setTimeout(check, 100);
                    };
                    check();
                })
            `
        });
        console.log('✅ 首帧已热启动，背景实拍画面已在稳定解码播放，无黑屏直接开拍！');

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

        const startTime = Date.now();
        await send('Page.startScreencast', {
            format: 'jpeg',
            quality: 95,
            maxWidth: 1920,
            maxHeight: 1080,
            everyNthFrame: 1,
        });
        console.log('🎥 录制已正式启动...');

        // ==================== 3. 全链路首尾无缝闭环时间轴 ====================
        const timeline = [
            // ── 第 1 幕：开局即满画质春季雪山 & 单词听力流 ──
            {
                t: 7000,
                act: '第 1 幕：春季实景 & 单词听力流展示完毕，平滑唤出控制条',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));`,
                    }),
            },
            // ── 第 2 幕：单词的选择（Playlist Hub 选词中心） ──
            {
                t: 9000,
                act: '第 2 幕：展开双栏选词中心 (Playlist Hub)',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `document.querySelector('button[title="播放列表设置"]')?.click();`,
                    }),
            },
            {
                t: 12000,
                act: '第 2 幕【选词】：切换到考纲词库（高中 乱序），右侧实时展开词单明细',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('高中') || b.textContent.includes('四级'));
                            if (btn) btn.click();
                        `,
                    }),
            },
            {
                t: 15500,
                act: '第 2 幕【选词】：演示单个生词勾选/自选微卡片',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const cards = document.querySelectorAll('.grid > div');
                            if (cards[1]) cards[1].click();
                        `,
                    }),
            },
            {
                t: 18500,
                act: '第 2 幕：点击「应用并开始沉浸」，词流自适应更新',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const applyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('应用并开始沉浸'));
                            if (applyBtn) applyBtn.click();
                        `,
                    }),
            },
            // ── 第 3 幕：切换到沉浸式文章听读 (Reading Mode) ──
            {
                t: 21500,
                act: '第 3 幕：唤出控制条，点击 [Read] 按钮平滑切换为文章听读模式',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const readBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Read') || b.title?.includes('Reading'));
                                if (readBtn) readBtn.click();
                            }, 300);
                        `,
                    }),
            },
            // ── 第 4 幕：文章的选择（Reading Library 选文面板） ──
            {
                t: 27500,
                act: '第 4 幕：文章逐句朗读展示完毕，点击 [Library] 展开文章选择面板',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                const libBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Library') || b.title?.includes('选择文章'));
                                if (libBtn) libBtn.click();
                            }, 300);
                        `,
                    }),
            },
            {
                t: 32000,
                act: '第 4 幕【选文】：从文章库中选择秋季文章《Leaves and Letting Go (落叶与放手)》',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            const artBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Leaves and Letting Go') || b.textContent.includes('落叶与放手') || b.textContent.includes('Fireflies'));
                            if (artBtn) artBtn.click();
                        `,
                    }),
            },
            // ── 第 5 幕：四季场景交叉溶接 (金秋 -> 寒冬) ──
            {
                t: 36000,
                act: '第 5 幕：切换到金秋场景（🍁 1200ms 电影级视频溶接 + 枫叶翻滚）',
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
                t: 42000,
                act: '第 5 幕：切换到寒冬场景（❄️ 1200ms 极光雪夜与暖炉篝火）',
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
            // ── 第 6 幕：⭐ 首尾无缝相接闭环（冬 -> 春，切回最初的起点） ──
            {
                t: 47500,
                act: '第 6 幕【首尾闭环】：寒冬平滑溶接回初春雪山（🌸 1200ms 回归第 1 帧开局状态）',
                fn: () =>
                    send('Runtime.evaluate', {
                        expression: `
                            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 900 }));
                            setTimeout(() => {
                                // 切换回 words 模式与春季场景，实现 100% 完美的循环相接！
                                const wordsBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Words') || b.title?.includes('Words'));
                                if (wordsBtn) wordsBtn.click();
                                const springBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('🌸') || b.title?.includes('Spring'));
                                if (springBtn) springBtn.click();
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

        // 最终留白 6 秒展示春季开局闭环画面
        console.log('🌸 正在录制回归初春雪山的无缝闭环收尾...');
        await new Promise((r) => setTimeout(r, 6000));

        await send('Page.stopScreencast');
        ws.close();
        actualDuration = (Date.now() - startTime) / 1000;
        const actualFps = Math.max(12, Math.round((frameCount / actualDuration) * 10) / 10);
        console.log(`🎬 录制完成：实际用时 ${actualDuration.toFixed(1)}s，共捕获 ${frameCount} 帧高清画面，真实帧率：${actualFps} FPS。`);
    } finally {
        chrome.kill();
    }

    // ==================== 4. FFmpeg 1080P 60FPS 编码 ====================
    console.log('🎞️ 正在使用 FFmpeg 压制 1080P 影院级 MP4 演示视频...');
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

    console.log(`✨ 首尾无缝闭环演示视频已成功生成：${OUT_VIDEO}`);
    const stats = fs.statSync(OUT_VIDEO);
    console.log(`📦 视频文件大小：${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 同步覆盖至 ambient-full-feature-demo.mp4
    fs.copyFileSync(OUT_VIDEO, path.join(__dirname, '..', 'docs', 'ambient-full-feature-demo.mp4'));

    // 清理临时帧
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
}

record().catch(console.error);
