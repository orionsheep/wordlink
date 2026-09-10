const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}

async function capture(url, outPath, options = {}) {
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1600,900',
        url
    ]);

    try {
        await new Promise(r => setTimeout(r, 2000));
        const list = await getJson('http://127.0.0.1:9222/json');
        const page = list.find(p => p.type === 'page');
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

        const waitMs = options.waitMs || 4500;
        console.log(`Page loading, waiting ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));

        if (options.evalScript) {
            await send('Runtime.evaluate', { expression: options.evalScript });
            await new Promise(r => setTimeout(r, 800));
        }

        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
        console.log(`Screenshot saved to ${outPath}`);
        ws.close();
    } finally {
        chrome.kill();
    }
}

const target = process.argv[2] || 'http://localhost:3000/ambient?auto=1';
const out = process.argv[3] || 'shot-latest.png';
const wait = parseInt(process.argv[4] || '4500', 10);
const evalCode = process.argv[5] || '';

capture(target, out, { waitMs: wait, evalScript: evalCode }).catch(console.error);
