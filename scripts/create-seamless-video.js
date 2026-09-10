/**
 * 创建首尾相接、100% 感受不到循环点的无缝星际视频 (Seamless Cosmic Loop Video)
 * 算法：
 * 1. 提取视频中间段与首尾过渡段
 * 2. 使用 ffmpeg xfade 滤镜将首尾交叉溶接 1.5s
 * 3. 产出首尾帧完全对齐的 veo3-seamless-loop.mp4
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FF = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/node_modules/ffmpeg-static/ffmpeg.exe';
const input = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-interstellar.mp4';
const output = 'C:/Users/Administrator/Desktop/澳门比赛/wordlink-main/public/videos/veo3-seamless-loop.mp4';

// 8s 视频：把后 2.0s 拆出作为过渡段，前 6.0s 作为主体段，然后 xfade 溶接 1.8s
// [v0] trim 0..6s, [v1] trim 6..8s
// [v1] + [v0] 溶接 => 新视频总长 8 - 1.8 = 6.2s，首尾完全无缝对齐
const cmd = `"${FF}" -y -i "${input}" -filter_complex "[0:v]trim=start=0:end=6.2,setpts=PTS-STARTPTS[main]; [0:v]trim=start=6.2:end=8.0,setpts=PTS-STARTPTS[tail]; [tail][main]xfade=transition=fade:duration=1.5:offset=0.3,format=yuv420p[v]" -map "[v]" -c:v libx264 -crf 20 -preset slow "${output}"`;

console.log('Running ffmpeg seamless crossfade...');
execSync(cmd, { stdio: 'inherit' });
console.log('✅ Generated seamless loop video! Size:', fs.statSync(output).size);
