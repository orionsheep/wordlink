/**
 * Ambient 背景音乐引擎 —— 基于 HTMLAudioElement 的轻量播放器。
 *
 * 与合成声景（SoundScapeEngine）并行工作、独立音量；
 * 支持 1s 淡入淡出换曲、TTS 朗读时自动 duck 到 40%。
 * 曲目未配置（AMBIENT_MUSIC_TRACKS 为空）时完全不初始化，零开销。
 */

import type { AmbientMusicTrack } from './musicTracks';

function rampVolume(audio: HTMLAudioElement, to: number, ms: number): void {
    const from = audio.volume;
    const start = performance.now();
    const step = () => {
        const t = Math.min((performance.now() - start) / ms, 1);
        // ease-in-out 插值，与全局动效曲线同语言
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        audio.volume = Math.max(0, Math.min(1, from + (to - from) * eased));
        if (t < 1 && !audio.paused) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

export class BackgroundMusicEngine {
    private audio: HTMLAudioElement | null = null;
    private currentId: string | null = null;
    private baseVolume = 0.5;
    private gainFactor = 0.55;
    private duckFactor = 1;
    private fadingTo: string | null = null;

    get isEmpty(): boolean {
        return this.currentId === null && this.audio === null;
    }

    private applyTarget(immediate = false) {
        if (!this.audio) return;
        const target = Math.max(0, Math.min(1, this.baseVolume * this.gainFactor * this.duckFactor));
        if (immediate) this.audio.volume = target;
        else rampVolume(this.audio, target, 600);
    }

    setVolume(v: number) {
        this.baseVolume = Math.max(0, Math.min(1, v));
        this.applyTarget();
    }

    /** TTS 朗读时压低音乐 */
    setDucked(ducked: boolean) {
        this.duckFactor = ducked ? 0.4 : 1;
        this.applyTarget();
    }

    /** 播放指定曲目；若已在播同一首则只调音量（1s 平滑淡入） */
    play(track: AmbientMusicTrack) {
        if (this.currentId === track.id && this.audio && !this.audio.paused) return;
        this.fadingTo = track.id;

        // 换曲：旧曲 800ms 淡出后废弃
        if (this.audio) {
            const old = this.audio;
            old.loop = false;
            rampVolume(old, 0, 800);
            window.setTimeout(() => {
                old.pause();
                old.src = '';
            }, 900);
        }

        const audio = new Audio(track.src);
        audio.loop = track.loop ?? true;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        this.audio = audio;
        this.currentId = track.id;
        this.gainFactor = track.gain ?? 0.55;

        audio.volume = 0;
        void audio.play().then(() => {
            if (this.fadingTo === track.id) this.applyTarget();
        }).catch(() => {
            // 自动播放被拦截（无用户手势）：保持静默，下次手势触发的 play 会恢复
        });
    }

    resume() {
        void this.audio?.play().catch(() => {});
    }

    stop() {
        this.fadingTo = null;
        if (this.audio) {
            rampVolume(this.audio, 0, 500);
            const a = this.audio;
            window.setTimeout(() => a.pause(), 550);
        }
    }

    dispose() {
        this.stop();
        window.setTimeout(() => {
            this.audio?.pause();
            this.audio = null;
            this.currentId = null;
        }, 600);
    }
}
