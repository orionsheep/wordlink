const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function fetchPage() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'https://gallery.adventure-x.cn/projects/cmrz6haix000802k2xnyfe7e5'
  ]);

  try {
    await new Promise(r => setTimeout(r, 4000));
    http.get('http://127.0.0.1:9222/json', (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        try {
          const list = JSON.parse(d);
          const page = list.find(p => p.type === 'page');
          if (!page) { console.log('no page'); return; }
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise(r => ws.on('open', r));

          let id = 1;
          const send = (m, p={}) => new Promise(res => {
            const i = id++;
            ws.on('message', function h(raw) {
              const msg = JSON.parse(raw);
              if (msg.id === i) { ws.off('message', h); res(msg.result); }
            });
            ws.send(JSON.stringify({ id: i, method: m, params: p }));
          });

          await new Promise(r => setTimeout(r, 3000));
          const r = await send('Runtime.evaluate', {
            expression: `({
              title: document.title,
              text: document.body.innerText,
              h1: Array.from(document.querySelectorAll('h1, h2, h3, p')).map(e => e.innerText).filter(Boolean).slice(0, 30)
            })`,
            returnByValue: true
          });
          console.log('EXTRACTED DATA:', JSON.stringify(r.result.value, null, 2));
          ws.close();
        } catch(e) {
          console.error(e);
        } finally {
          chrome.kill();
        }
      });
    });
  } catch(e) {
    chrome.kill();
  }
}
fetchPage();
