const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const key = process.env.GEMINI_API_KEY;
const FF = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/node_modules/ffmpeg-static/ffmpeg.exe';

const PROMPTS = [
    {
        id: 'c_warp_tunnel',
        name: 'warp',
        prompt: 'Cinematic 4K hyper-speed warp drive interstellar journey, camera flying at light speed through a cosmic tunnel of glowing neon cyan and electric magenta star streaks, warping spacetime, futuristic hyperspace drift, ultra photorealistic, sleek dark luxury aesthetic',
        rawPath: 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-warp-raw.mp4',
        seamlessPath: 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-warp-seamless.mp4',
    },
    {
        id: 'd_pulsar_emerald',
        name: 'emerald',
        prompt: 'Cinematic 4K alien deep space journey, gliding over an ethereal cosmic ocean of glowing emerald green and teal aurora waves, rotating pulsar emitting celestial light beams, sparkling cosmic dust particles, dark mystical space aesthetic, smooth camera forward push',
        rawPath: 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-emerald-raw.mp4',
        seamlessPath: 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-emerald-seamless.mp4',
    },
    {
        id: 'e_blackhole_lensing',
        name: 'blackhole',
        prompt: 'Cinematic 4K supermassive black hole with radiant silver and white glowing accretion disk, gravitational lensing bending starfield light, celestial diamond stardust, deep pure black void, dark luxury interstellar aesthetic, smooth slow camera rotation drift',
        rawPath: 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-blackhole-raw.mp4',
        seamlessPath: 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-blackhole-seamless.mp4',
    }
];

function submitJob(promptText) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            instances: [{ prompt: promptText }],
            parameters: { sampleCount: 1, aspectRatio: '16:9' }
        });
        const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(d);
                    resolve(data.name);
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function pollOp(opName) {
    return new Promise((resolve, reject) => {
        https.get(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${key}`, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve(JSON.parse(d)); }
                catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function downloadUrl(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return downloadUrl(res.headers.location, dest).then(resolve).catch(reject);
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    });
}

async function processOne(item) {
    console.log(`\n🚀 [${item.name}] Submitting Veo 3.1 job...`);
    const opName = await submitJob(item.prompt);
    console.log(`📌 [${item.name}] Operation:`, opName);

    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 6000));
        const data = await pollOp(opName);
        console.log(`   [${item.name}] Poll ${i+1} done:`, data.done);
        if (data.done) {
            if (data.error) throw new Error(JSON.stringify(data.error));
            const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
            if (!uri) throw new Error('No URI');
            const downloadUri = uri + (uri.includes('?') ? '&key=' : '?key=') + key;
            console.log(`📥 [${item.name}] Downloading raw video...`);
            await downloadUrl(downloadUri, item.rawPath);
            console.log(`✅ [${item.name}] Downloaded raw:`, fs.statSync(item.rawPath).size, 'bytes');

            console.log(`🔄 [${item.name}] Rendering seamless loop with ffmpeg...`);
            const cmd = `"${FF}" -y -i "${item.rawPath}" -filter_complex "[0:v]trim=start=0:end=6.2,setpts=PTS-STARTPTS[main]; [0:v]trim=start=6.2:end=8.0,setpts=PTS-STARTPTS[tail]; [tail][main]xfade=transition=fade:duration=1.5:offset=0.3,format=yuv420p[v]" -map "[v]" -c:v libx264 -crf 20 -preset slow "${item.seamlessPath}"`;
            execSync(cmd, { stdio: 'inherit' });
            console.log(`🎉 [${item.name}] Seamless video ready:`, fs.statSync(item.seamlessPath).size, 'bytes');
            return;
        }
    }
}

(async () => {
    for (const item of PROMPTS) {
        await processOne(item);
    }
    console.log('\n🌟 ALL 3 VEO 3.1 VIDEOS GENERATED AND PROCESSED SUCCESSFULLY!');
})().catch(console.error);
