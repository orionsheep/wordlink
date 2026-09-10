const https = require('https');
const fs = require('fs');

const key = process.env.GEMINI_API_KEY;
const opName = 'models/veo-3.1-generate-preview/operations/fcr7t58b37u0';
const targetFile = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-interstellar.mp4';

async function checkOp() {
    return new Promise((resolve, reject) => {
        https.get(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${key}`, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(d);
                    resolve(data);
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function downloadUrl(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return downloadUrl(res.headers.location, dest).then(resolve).catch(reject);
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

(async () => {
    console.log('⏳ Polling Veo 3.1 generation operation...');
    for (let i = 0; i < 40; i++) {
        const data = await checkOp();
        console.log(`[Attempt ${i+1}] done:`, data.done, 'metadata:', JSON.stringify(data.metadata || {}));
        if (data.done) {
            if (data.error) {
                console.error('❌ Veo 3.1 Error:', data.error);
                process.exit(1);
            }
            console.log('🎉 Generation completed! Response keys:', Object.keys(data.response || {}));
            const predictions = data.response?.predictions;
            if (predictions && predictions[0]) {
                const p = predictions[0];
                if (p.bytesBase64Encoded) {
                    fs.writeFileSync(targetFile, Buffer.from(p.bytesBase64Encoded, 'base64'));
                    console.log('✅ Successfully saved video via base64, size:', fs.statSync(targetFile).size);
                } else if (p.videoUri || p.uri) {
                    const uri = p.videoUri || p.uri;
                    console.log('📥 Downloading video from URI:', uri);
                    await downloadUrl(uri, targetFile);
                    console.log('✅ Successfully downloaded video, size:', fs.statSync(targetFile).size);
                } else {
                    console.log('Prediction object:', JSON.stringify(p));
                }
            }
            return;
        }
        await new Promise(r => setTimeout(r, 6000));
    }
    console.log('Timeout waiting for Veo 3.1');
})().catch(console.error);
