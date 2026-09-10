const fs = require('fs');
const s = fs.readFileSync('C:/Users/Administrator/Desktop/澳门比赛/herochunk.js', 'utf8');
console.log('len', s.length);
console.log('video', s.includes('hf_20260813'));
console.log('elevate', s.includes('Elevate your essential data'));
console.log('amount', s.includes('14,205,890'));
console.log('bars', s.includes('animate-bar-grow'));
