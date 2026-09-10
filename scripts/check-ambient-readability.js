const puppeteer = require('puppeteer-core');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: 'new',
        args: [
            '--window-size=1600,900',
            '--autoplay-policy=no-user-gesture-required',
            '--use-gl=angle',
            '--enable-gpu-rasterization',
        ],
        defaultViewport: { width: 1600, height: 900 },
    });
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/ambient?mode=reading', { waitUntil: 'networkidle2', timeout: 60000 });
    // 等句子浮现 + 中文译文出现
    await new Promise(r => setTimeout(r, 14000));
    await page.screenshot({ path: 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/scripts/ambient-readability-check.png' });
    await browser.close();
    console.log('OK');
})().catch(e => { console.error(e.message); process.exit(1); });
