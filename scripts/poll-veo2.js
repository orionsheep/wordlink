const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const key = process.env.GEMINI_API_KEY;
const opName = 'models/veo-3.1-generate-preview/operations/jjfvsf6q5jxl';
const rawFile = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-amber-galaxy.mp4';
const seamlessFile = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-amber-seamless.mp4';
const FF = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/node_modules/ffmpeg-static/ffmpeg.exe';

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
    console.log('⏳ Polling Veo 3.1 generation for 2nd cosmic video (Amber Galaxy)...');
    for (let i = 0; i < 40; i++) {
        const data = await checkOp();
        console.log(`[Attempt ${i+1}] done:`, data.done);
        if (data.done) {
            if (data.error) {
                console.error('❌ Veo 3.1 Error:', data.error);
                process.exit(1);
            }
            const samples = data.response?.generateVideoResponse?.generatedSamples;
            const uri = samples?.[0]?.video?.uri;
            if (uri) {
                const downloadUri = uri + (uri.includes('?') ? '&key=' : '?key=') + key;
                console.log('📥 Downloading video from URI...');
                await downloadUrl(downloadUri, rawFile);
                console.log('✅ Downloaded raw video! Size:', fs.statSync(rawFile).size);

                console.log('🔄 Creating seamless loop via ffmpeg xfade...');
                const cmd = `"${FF}" -y -i "${rawFile}" -filter_complex "[0:v]trim=start=0:end=6.2,setpts=PTS-STARTPTS[main]; [0:v]trim=start=6.2:end=8.0,setpts=PTS-STARTPTS[tail]; [tail][main]xfade=transition=fade:duration=1.5:offset=0.3,format=yuv420p[v]" -map "[v]" -c:v libx264 -crf 20 -preset slow "${seamlessFile}"`;
                execSync(cmd, { stdio: 'inherit' });
                console.log('🎉 Wrote seamless file:', seamlessFile, 'size:', fs.statSync(seamlessFile).size);
            }
            return;
        }
        await new Promise(r => setTimeout(r, 6000));
    }
})().catch(console.error);
