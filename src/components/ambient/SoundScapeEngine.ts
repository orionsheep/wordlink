/**
 * Ambient 屏保四季声景合成器 —— 纯 Web Audio API 实时合成，零外部音频资源。
 *
 * 🌸 春·细雨鸟鸣   白噪声低通(雨) + 随机高频啁啾振荡器(鸟)
 * ✨ 夏·夜风蝉鸣   粉噪声(远风) + 窄带调幅持续音(蝉)，间歇性爆发
 * 🍁 秋·林叶落霞   棕噪声缓涌(风) + 随机短促带通噪声脉冲(叶响)
 * ❄️ 冬·篝火飞雪   低频涌动(火堆) + 随机噼啪爆点 + 极轻的高频空气感
 *
 * 支持场景 1s 交叉淡切、音量平滑调节、朗读时自动 duck 到 35%。
 */

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

interface SceneHandles {
    gain: GainNode;
    cleanup: Array<() => void>;
}

/** 生成 2 秒循环噪声缓冲 */
function makeNoiseBuffer(ctx: AudioContext, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);

    if (kind === 'white') {
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'brown') {
        let last = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            last = (last + 0.02 * w) / 1.02;
            d[i] = last * 3.5;
        }
    } else {
        // Paul Kellet 近似粉噪
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + w * 0.0555179;
            b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856;
            b4 = 0.55 * b4 + w * 0.5329522;
            b5 = -0.7616 * b5 - w * 0.016898;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
            b6 = w * 0.115926;
        }
    }
    return buf;
}

export class SoundScapeEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private scene: SceneHandles | null = null;
    private baseVolume = 0.55;
    private duckFactor = 1;

    private ensureCtx(): AudioContext {
        if (!this.ctx) {
            const AC: typeof AudioContext =
                window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0;
            this.master.connect(this.ctx.destination);
        }
        return this.ctx;
    }

    private applyMasterGain(timeConstant = 0.15) {
        if (!this.ctx || !this.master) return;
        const target = this.baseVolume * this.duckFactor;
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(target, this.ctx.currentTime, timeConstant);
    }

    setVolume(v: number) {
        this.baseVolume = Math.max(0, Math.min(1, v));
        this.applyMasterGain();
    }

    /** 朗读时压低环境音 */
    setDucked(ducked: boolean) {
        this.duckFactor = ducked ? 0.35 : 1;
        this.applyMasterGain(0.12);
    }

    /** 首次启动（需用户手势）或从挂起恢复 */
    async resumeAndPlay(season: SeasonId) {
        const ctx = this.ensureCtx();
        if (ctx.state === 'suspended') await ctx.resume();
        if (!this.scene) this.buildScene(season);
        this.applyMasterGain(0.5);
    }

    suspend() {
        void this.ctx?.suspend();
    }

    /** 场景交叉淡切：旧声景 1s 淡出销毁，新声景淡入 */
    switchSeason(season: SeasonId) {
        if (!this.ctx || !this.scene) {
            void this.resumeAndPlay(season);
            return;
        }
        const old = this.scene;
        old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.33);
        const timer = window.setTimeout(() => this.teardown(old), 1400);
        old.cleanup.push(() => window.clearTimeout(timer));
        this.scene = null;
        this.buildScene(season);
    }

    stop() {
        if (this.scene && this.ctx) {
            this.scene.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
            const s = this.scene;
            window.setTimeout(() => this.teardown(s), 1000);
            this.scene = null;
        }
        this.applyMasterGain();
    }

    dispose() {
        this.stop();
        window.setTimeout(() => {
            this.scene?.cleanup.forEach((fn) => fn());
            void this.ctx?.close();
            this.ctx = null;
            this.master = null;
        }, 1100);
    }

    // ------------------------------------------------------------------

    private buildScene(season: SeasonId) {
        if (!this.ctx || !this.master) return;
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.4);
        gain.connect(this.master);

        const scene: SceneHandles = { gain, cleanup: [] };
        this.scene = scene;

        switch (season) {
            case 'spring':
                scene.cleanup.push(...this.buildSpring(gain));
                break;
            case 'summer':
                scene.cleanup.push(...this.buildSummer(gain));
                break;
            case 'autumn':
                scene.cleanup.push(...this.buildAutumn(gain));
                break;
            case 'winter':
                scene.cleanup.push(...this.buildWinter(gain));
                break;
        }
    }

    private teardown(scene: SceneHandles) {
        scene.cleanup.forEach((fn) => fn());
        try {
            scene.gain.disconnect();
        } catch {
            /* noop */
        }
    }

    /** 循环噪声源 → 低通滤波 → 定增益，返回 stop 函数 */
    private noiseChain(
        parent: AudioNode,
        kind: 'white' | 'pink' | 'brown',
        cutoffHz: number,
        level: number,
    ): () => void {
        const ctx = this.ensureCtx();
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, kind);
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoffHz;
        const g = ctx.createGain();
        g.gain.value = level;
        src.connect(filter).connect(g).connect(parent);
        src.start();
        return () => {
            try {
                src.stop();
                src.disconnect();
                filter.disconnect();
                g.disconnect();
            } catch {
                /* noop */
            }
        };
    }

    // 🌸 春：细雨 + 鸟鸣
    private buildSpring(parent: GainNode): Array<() => void> {
        const stops: Array<() => void> = [this.noiseChain(parent, 'white', 1400, 0.14)];
        const chirp = () => {
            const ctx = this.ensureCtx();
            const t0 = ctx.currentTime + Math.random() * 0.5;
            const syllables = 2 + Math.floor(Math.random() * 2);
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            const g = ctx.createGain();
            g.gain.value = 0;
            osc.connect(g).connect(parent);
            const baseF = 2300 + Math.random() * 1000;
            for (let i = 0; i < syllables; i++) {
                const st = t0 + i * 0.17;
                osc.frequency.setValueAtTime(baseF, st);
                osc.frequency.exponentialRampToValueAtTime(baseF * 1.35, st + 0.06);
                osc.frequency.exponentialRampToValueAtTime(baseF * 0.85, st + 0.13);
                g.gain.setValueAtTime(0, st);
                g.gain.linearRampToValueAtTime(0.08 + Math.random() * 0.04, st + 0.03);
                g.gain.linearRampToValueAtTime(0, st + 0.15);
            }
            const end = t0 + syllables * 0.17 + 0.25;
            osc.start(t0);
            osc.stop(end);
            osc.onended = () => {
                try {
                    osc.disconnect();
                    g.disconnect();
                } catch {
                    /* noop */
                }
            };
        };
        const timer = window.setInterval(chirp, 2400 + Math.random() * 3000);
        stops.push(() => window.clearInterval(timer), chirp);
        return stops;
    }

    // ✨ 夏：夜风 + 蝉鸣
    private buildSummer(parent: GainNode): Array<() => void> {
        const ctx = this.ensureCtx();
        const stops: Array<() => void> = [this.noiseChain(parent, 'pink', 420, 0.16)];

        const carrier = ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.value = 4200 + Math.random() * 400;
        const am = ctx.createGain();
        am.gain.value = 0.0001;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 26 + Math.random() * 8;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.05;
        const burst = ctx.createGain();
        burst.gain.value = 0;
        carrier.connect(am).connect(burst).connect(parent);
        lfo.connect(lfoGain).connect(am.gain);
        carrier.start();
        lfo.start();

        // 蝉鸣阵发：叫几秒歇几秒
        let on = false;
        const rhythm = window.setInterval(() => {
            on = !on;
            burst.gain.setTargetAtTime(
                on ? 0.7 + Math.random() * 0.3 : 0,
                ctx.currentTime,
                on ? 0.4 : 0.8,
            );
        }, 3500 + Math.random() * 2500);

        stops.push(() => {
            window.clearInterval(rhythm);
            try {
                carrier.stop();
                lfo.stop();
                carrier.disconnect();
                am.disconnect();
                lfo.disconnect();
                lfoGain.disconnect();
                burst.disconnect();
            } catch {
                /* noop */
            }
        });
        return stops;
    }

    // 🍁 秋：缓风 + 叶响
    private buildAutumn(parent: GainNode): Array<() => void> {
        const ctx = this.ensureCtx();
        const stops: Array<() => void> = [];

        // 风：棕噪 + 缓慢起伏的滤波频率
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, 'brown');
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        const swell = ctx.createOscillator();
        swell.type = 'sine';
        swell.frequency.value = 0.06;
        const swellGain = ctx.createGain();
        swellGain.gain.value = 130;
        const windLevel = ctx.createGain();
        windLevel.gain.value = 0.24;
        src.connect(filter).connect(windLevel).connect(parent);
        swell.connect(swellGain).connect(filter.frequency);
        src.start();
        swell.start();
        stops.push(() => {
            try {
                src.stop();
                swell.stop();
                src.disconnect();
                filter.disconnect();
                windLevel.disconnect();
                swell.disconnect();
                swellGain.disconnect();
            } catch {
                /* noop */
            }
        });

        // 叶响：随机短促带通噪声脉冲
        const rustle = () => {
            const c = this.ensureCtx();
            const t0 = c.currentTime + Math.random() * 0.3;
            const burstSrc = c.createBufferSource();
            burstSrc.buffer = makeNoiseBuffer(c, 'white');
            const bp = c.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 1500 + Math.random() * 1200;
            bp.Q.value = 0.9;
            const g = c.createGain();
            g.gain.setValueAtTime(0, t0);
            g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.06, t0 + 0.04);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
            burstSrc.connect(bp).connect(g).connect(parent);
            burstSrc.start(t0, Math.random(), 0.6);
            burstSrc.onended = () => {
                try {
                    burstSrc.disconnect();
                    bp.disconnect();
                    g.disconnect();
                } catch {
                    /* noop */
                }
            };
        };
        const timer = window.setInterval(rustle, 2600 + Math.random() * 3600);
        stops.push(() => window.clearInterval(timer), rustle);
        return stops;
    }

    // ❄️ 冬：篝火 + 雪夜空气感
    private buildWinter(parent: GainNode): Array<() => void> {
        const stops: Array<() => void> = [
            this.noiseChain(parent, 'brown', 140, 0.3),
            this.noiseChain(parent, 'white', 8000, 0.006),
        ];

        // 噼啪爆点
        const crackle = () => {
            const c = this.ensureCtx();
            const t0 = c.currentTime;
            const pop = c.createOscillator();
            pop.type = 'triangle';
            pop.frequency.value = 1800 + Math.random() * 2500;
            const g = c.createGain();
            g.gain.setValueAtTime(0.02 + Math.random() * 0.09, t0);
            g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.035);
            pop.connect(g).connect(parent);
            pop.start(t0);
            pop.stop(t0 + 0.05);
            pop.onended = () => {
                try {
                    pop.disconnect();
                    g.disconnect();
                } catch {
                    /* noop */
                }
            };
            scheduleCrackle();
        };
        const scheduleCrackle = () => {
            const t = window.setTimeout(crackle, 70 + Math.random() * 320);
            crackleTimers.push(t);
        };
        const crackleTimers: number[] = [];
        scheduleCrackle();
        stops.push(() => crackleTimers.forEach((t) => window.clearTimeout(t)));
        return stops;
    }
}
