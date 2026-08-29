'use client';

import { useEffect, useRef } from 'react';
import type { SeasonId } from './SoundScapeEngine';

/**
 * 电影级智能变色季节粒子引擎 (ParticleLayer)
 *
 * 核心升级：
 * 1. 【随背景色与季节动态变色】：
 *    - 🌸 春·粉霞初阳：透粉樱花瓣 (#ffb7c5, #ffd2dc, #f7a8bc) 带晨光高光
 *    - ✨ 夏·幽蓝微夜：荧绿与金黄夜萤 (#d6eb8c, #fef08a) 双层呼吸光晕
 *    - 🍁 秋·金红深林：暖橙与焦糖枫叶 (#c97b3d, #b5552d, #ea580c, #d99a4e) 带叶脉微光
 *    - ❄️ 冬·极光雪夜：纯白柔焦雪粒与冰蓝微晶 (#ffffff, #e0f2fe, #bae6fd)
 * 2. 【换季平滑过渡 (Particle Crossfade)】：
 *    - 换季时不粗暴清空粒子，旧粒子自然飘出视野，新季变色粒子从上方顺着气流飘入；
 * 3. 【全季预渲染精灵图库 (Offscreen Sprite Atlas)】：
 *    - 启动时完成所有季节精灵图预渲染，换季 0 延迟、60FPS 极速渲染。
 */

interface Particle {
    x: number;
    y: number;
    z: number; // 景深 0.35~1.0
    vx: number;
    vy: number;
    size: number;
    rot: number;
    rotSpeed: number;
    flipPhase: number;
    flipSpeed: number;
    phase: number;
    flicker: number;
    season: SeasonId; // 当前粒子所属季节（支持换季双群共存过渡）
    spriteIdx: number;
    alpha: number;
}

const PARTICLE_TARGET_COUNT: Record<SeasonId, number> = {
    spring: 80,
    summer: 45,
    autumn: 70,
    winter: 140,
};

const PETAL_COLORS = ['#ffb7c5', '#ffd2dc', '#f7a8bc', '#fbcfe8'];
const LEAF_COLORS = ['#c97b3d', '#b5552d', '#ea580c', '#d99a4e', '#9a3412'];
const FIREFLY_COLORS = ['#d6eb8c', '#e8f8b2', '#fef08a'];
const SNOW_COLORS = ['#ffffff', '#f0f9ff', '#e0f2fe'];

/** 预渲染一片花瓣/枫叶/雪花精灵 */
function makeSprite(size: number, color: string, kind: 'petal' | 'leaf' | 'firefly' | 'snow'): HTMLCanvasElement {
    const pad = size * 0.8;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((size + pad) * 2);
    canvas.height = Math.ceil((size + pad) * 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    if (kind === 'petal') {
        // 花瓣：水滴形轮廓 + 柔和内发光渐变
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
        g.addColorStop(0, color + 'ff');
        g.addColorStop(0.7, color + 'e6');
        g.addColorStop(1, color + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.bezierCurveTo(cx + size * 0.95, cy - size * 0.55, cx + size * 0.8, cy + size * 0.65, cx, cy + size);
        ctx.bezierCurveTo(cx - size * 0.8, cy + size * 0.65, cx - size * 0.95, cy - size * 0.55, cx, cy - size);
        ctx.fill();
    } else if (kind === 'leaf') {
        // 枫叶：菱形叶身 + 主叶脉 + 侧脉微光
        ctx.translate(cx, cy);
        const g = ctx.createLinearGradient(0, -size, 0, size);
        g.addColorStop(0, color);
        g.addColorStop(1, color + 'cc');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.65, -size * 0.15);
        ctx.lineTo(size * 0.4, size * 0.85);
        ctx.lineTo(-size * 0.4, size * 0.85);
        ctx.lineTo(-size * 0.65, -size * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(0.6, size * 0.07);
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.85);
        ctx.quadraticCurveTo(size * 0.08, 0, 0, size * 0.8);
        ctx.stroke();
    } else if (kind === 'firefly') {
        // 萤火虫：高斯扩散呼吸光斑
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 2.5);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.2, color);
        g.addColorStop(0.6, color + '44');
        g.addColorStop(1, color + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 2.5, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // 雪花：柔边径向渐变冰晶点
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.5);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, color + 'ee');
        g.addColorStop(1, color + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    return canvas;
}

export default function ParticleLayer({ season, paused }: { season: SeasonId; paused: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const seasonRef = useRef(season);
    const pausedRef = useRef(paused);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        seasonRef.current = season;
    }, [season]);
    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let particles: Particle[] = [];
        let w = 0;
        let h = 0;
        let running = true;
        let t = 0;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = window.innerWidth;
            h = window.innerHeight;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        // 预渲染全季精灵图集
        const spriteAtlas: Record<SeasonId, HTMLCanvasElement[]> = {
            spring: PETAL_COLORS.map((c) => makeSprite(10, c, 'petal')),
            summer: FIREFLY_COLORS.map((c) => makeSprite(4, c, 'firefly')),
            autumn: LEAF_COLORS.map((c) => makeSprite(11, c, 'leaf')),
            winter: SNOW_COLORS.map((c) => makeSprite(5, c, 'snow')),
        };

        const spawn = (p: Particle, init: boolean, targetSeason?: SeasonId): void => {
            const s = targetSeason || seasonRef.current;
            p.season = s;
            p.z = 0.35 + Math.random() * 0.65;
            p.phase = Math.random() * Math.PI * 2;
            p.flicker = 0.5 + Math.random() * 1.5;
            p.flipPhase = Math.random() * Math.PI * 2;
            p.flipSpeed = 0.8 + Math.random() * 1.4;
            p.alpha = 0.85;

            const sprites = spriteAtlas[s];
            p.spriteIdx = Math.floor(Math.random() * sprites.length);

            switch (s) {
                case 'spring':
                    p.x = Math.random() * w;
                    p.y = init ? Math.random() * h : -20 - Math.random() * h * 0.15;
                    p.vx = 0.22 + Math.random() * 0.45;
                    p.vy = 0.32 + Math.random() * 0.55;
                    p.size = (4 + Math.random() * 5) * p.z;
                    p.rot = Math.random() * Math.PI * 2;
                    p.rotSpeed = (Math.random() - 0.5) * 0.03;
                    break;
                case 'summer':
                    p.x = Math.random() * w;
                    p.y = init ? Math.random() * h : h * 0.22 + Math.random() * h * 0.78;
                    p.vx = (Math.random() - 0.5) * 0.24;
                    p.vy = (Math.random() - 0.5) * 0.18;
                    p.size = (1.5 + Math.random() * 1.6) * p.z;
                    p.rot = 0;
                    p.rotSpeed = 0;
                    break;
                case 'autumn':
                    p.x = Math.random() * w;
                    p.y = init ? Math.random() * h : -24 - Math.random() * h * 0.25;
                    p.vx = 0.14 + Math.random() * 0.52;
                    p.vy = 0.45 + Math.random() * 0.85;
                    p.size = (5 + Math.random() * 6) * p.z;
                    p.rot = Math.random() * Math.PI * 2;
                    p.rotSpeed = (Math.random() - 0.5) * 0.05;
                    break;
                case 'winter':
                    p.x = Math.random() * w;
                    p.y = init ? Math.random() * h : -10 - Math.random() * h * 0.15;
                    p.vx = (Math.random() - 0.5) * 0.15;
                    p.vy = 0.28 + Math.random() * 0.75;
                    p.size = (1.2 + Math.random() * 2.8) * p.z;
                    p.rot = 0;
                    p.rotSpeed = 0;
                    break;
            }
        };

        const onVisibility = () => {
            running = !document.hidden;
            if (running) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(tick);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        const tick = (): void => {
            if (!running) return;
            t += 0.016;
            ctx.clearRect(0, 0, w, h);
            const currentSeason = seasonRef.current;

            // 全局气流正弦波
            const wind = Math.sin(t * 0.18) * 0.35 + Math.sin(t * 0.07 + 1.3) * 0.22;

            // 动态调节粒子总数以契合当前季节
            const targetCount = PARTICLE_TARGET_COUNT[currentSeason];
            if (particles.length < targetCount) {
                const add = {} as Particle;
                spawn(add, false, currentSeason);
                particles.push(add);
            } else if (particles.length > targetCount + 20) {
                particles.pop();
            }

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                const sprites = spriteAtlas[p.season];
                const sprite = sprites[p.spriteIdx % sprites.length];

                // 运动学更新
                switch (p.season) {
                    case 'spring': {
                        p.x += (p.vx + wind * 0.6) * p.z;
                        p.y += p.vy * p.z;
                        p.rot += p.rotSpeed;
                        p.flipPhase += 0.016 * p.flipSpeed;
                        if (sprite) {
                            const flip = Math.sin(p.flipPhase);
                            ctx.save();
                            ctx.globalAlpha = (0.45 + p.z * 0.45) * p.alpha;
                            ctx.translate(p.x, p.y);
                            ctx.rotate(p.rot);
                            ctx.scale(Math.max(0.18, Math.abs(flip)), 1);
                            const half = sprite.width / 2;
                            ctx.drawImage(sprite, -half, -half);
                            ctx.restore();
                        }
                        break;
                    }
                    case 'summer': {
                        p.x += p.vx + Math.sin(t * 0.4 + p.phase) * 0.16;
                        p.y += p.vy;
                        const glow = (Math.sin(t * p.flicker * 2 + p.phase) + 1) / 2;
                        const alpha = (0.1 + glow * 0.75 * p.z) * p.alpha;
                        if (sprite) {
                            ctx.save();
                            ctx.globalAlpha = alpha;
                            ctx.translate(p.x, p.y);
                            const half = sprite.width / 2;
                            ctx.drawImage(sprite, -half, -half);
                            ctx.restore();
                        }
                        break;
                    }
                    case 'autumn': {
                        p.x += (p.vx + wind * 0.95) * p.z;
                        p.y += p.vy * p.z;
                        p.rot += p.rotSpeed + Math.sin(t + p.phase) * 0.014;
                        p.flipPhase += 0.016 * p.flipSpeed;
                        if (sprite) {
                            const flip = Math.cos(p.flipPhase);
                            ctx.save();
                            ctx.globalAlpha = (0.55 + p.z * 0.42) * p.alpha;
                            ctx.translate(p.x, p.y);
                            ctx.rotate(p.rot);
                            ctx.scale(Math.max(0.22, Math.abs(flip)), 1);
                            const half = sprite.width / 2;
                            ctx.drawImage(sprite, -half, -half);
                            ctx.restore();
                        }
                        break;
                    }
                    case 'winter': {
                        p.x += (Math.sin(t * p.flicker + p.phase) * 0.32 + wind * 0.45) * p.z;
                        p.y += p.vy * p.z;
                        if (sprite) {
                            ctx.save();
                            ctx.globalAlpha = (0.35 + p.z * 0.6) * p.alpha;
                            ctx.translate(p.x, p.y);
                            const half = sprite.width / 2;
                            ctx.drawImage(sprite, -half, -half);
                            ctx.restore();
                        }
                        break;
                    }
                }

                // 出界回收：重生为当前最新的季节颜色粒子
                if (p.y > h + 28 || p.x > w + 36 || p.x < -36) {
                    spawn(p, false, currentSeason);
                }
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        // 初始生成粒子群
        particles = Array.from({ length: PARTICLE_TARGET_COUNT[seasonRef.current] }, () => {
            const p = {} as Particle;
            spawn(p, true, seasonRef.current);
            return p;
        });
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            running = false;
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 z-[2]"
            aria-hidden="true"
        />
    );
}
