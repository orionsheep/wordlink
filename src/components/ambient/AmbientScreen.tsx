'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    BookOpen,
    BookOpenText,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ListMusic,
    Music,
    Pause,
    Play,
    SkipForward,
    Volume2,
    VolumeX,
    X,
} from 'lucide-react';
import SceneVideoLayer from './SceneVideoLayer';
import WordFloatCard from './WordFloatCard';
import AmbientClock from './AmbientClock';
import AmbientSettings from './AmbientSettings';
import ReadingMode from './ReadingMode';
import type { ReadingApi } from './ReadingMode';
import { DEFAULT_AMBIENT_CONFIG } from './AmbientSettings';
import type { AmbientConfig } from './AmbientSettings';
import { VoiceEngine } from './VoiceEngine';
import { SoundScapeEngine } from './SoundScapeEngine';
import { BackgroundMusicEngine } from './BackgroundMusicEngine';
import { AMBIENT_MUSIC_TRACKS, pickTrackForSeason } from './musicTracks';
import type { SeasonId } from './SoundScapeEngine';
import { useIdleControls } from './useIdleControls';
import { FALLBACK_WORD_POOL, sampleWords } from './wordPool';
import type { AmbientWordCard } from './wordPool';
import './ambient.css';

/* ============================================================
 * WordLink Ambient —— 屏保级沉浸单词流
 *
 * 图层：z0 视频 → z1 PNG 覆盖层(train-bob) → z2 粒子 → z3 时钟/词卡/统计
 *      → z4 控件 → z5 全屏外框（纯装饰）
 * 节奏对齐 Lumora 原规格：
 *   - 视频层透明度过渡 1000ms ease-in-out，不设原生 loop，
 *     结尾前 1.15s 提前交叉淡切下一场景（无缝收尾）
 *   - 浮层淡入淡出 cubic-bezier(0.4,0,0.2,1)
 * ============================================================ */

const SEASONS: Array<{ id: SeasonId; emoji: string; label: string }> = [
    { id: 'spring', emoji: '🌸', label: 'Spring' },
    { id: 'summer', emoji: '✨', label: 'Summer' },
    { id: 'autumn', emoji: '🍁', label: 'Autumn' },
    { id: 'winter', emoji: '❄️', label: 'Winter' },
];

const SPEAK_WORD_AT_MS = 1800;
const SPEAK_DEF_AT_MS = 5200;
/** 季节切换冷却，对齐原规格的 1000ms 交叉淡切节奏 */
const SEASON_COOLDOWN_MS = 1000;
/** 原提示词的 PNG 覆盖层（已本地化，避免远程加载抖动） */
const OVERLAY_PNG = '/ambient/scene-overlay.png';

interface CardEntry {
    id: number;
    card: AmbientWordCard;
    leaving: boolean;
}

/** 从配置指定词库加载词卡；失败则用内置兜底词池 */
async function loadWordCards(cfg: AmbientConfig): Promise<AmbientWordCard[]> {
    try {
        if (cfg.path) {
            const res = await fetch(
                `/api/library-words?path=${encodeURIComponent(cfg.path)}&groupIndex=${cfg.groupIndex}&groupSize=${cfg.groupSize}&includeDefinitions=true`,
            );
            if (res.ok) {
                const data: unknown = await res.json();
                if (Array.isArray(data)) {
                    const cards = (
                        data as Array<{
                            word?: string;
                            chineseData?: { phonetic?: string; concise_definition?: string } | null;
                        }>
                    )
                        .filter((w) => typeof w?.word === 'string')
                        .map((w) => ({
                            word: w.word as string,
                            phonetic: w.chineseData?.phonetic || undefined,
                            definition: w.chineseData?.concise_definition || undefined,
                        }));
                    if (cards.length >= 5) return cards;
                }
            }
        }
    } catch {
        /* 静默降级到兜底词池 */
    }
    return FALLBACK_WORD_POOL;
}

export default function AmbientScreen() {
    const router = useRouter();

    const [started] = useState(true);

    const [seasonIdx, setSeasonIdx] = useState(0);
    const season: SeasonId = SEASONS[seasonIdx].id;

    const [cfg, setCfg] = useState<AmbientConfig>(DEFAULT_AMBIENT_CONFIG);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const [words, setWords] = useState<AmbientWordCard[]>([]);
    const [wordIdx, setWordIdx] = useState(0);
    /** 同台渲染的词卡（最多 2 张：退场中的旧词 + 进场中的新词） */
    const [entries, setEntries] = useState<CardEntry[]>([]);
    const entryIdRef = useRef(0);
    const [shownCount, setShownCount] = useState(0);

    const [paused, setPaused] = useState(false);
    const [voiceOn, setVoiceOn] = useState(true);
    const [musicOn, setMusicOn] = useState(AMBIENT_MUSIC_TRACKS.length > 0);
    const [volume, setVolume] = useState(0.55);
    /** 模式：words = 单词听力流，reading = 沉浸式文章听读 */
    const [mode, setMode] = useState<'words' | 'reading'>(
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('mode') === 'reading'
            ? 'reading'
            : 'words',
    );
    const kioskArticleId =
        typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('article') || undefined
            : undefined;

    const readerApiRef = useRef<ReadingApi | null>(null);
    const [readerPlaying, setReaderPlaying] = useState(true);

    const voiceRef = useRef<VoiceEngine | null>(null);
    const soundRef = useRef<SoundScapeEngine | null>(null);
    const musicRef = useRef<BackgroundMusicEngine | null>(null);
    const hasMusic = AMBIENT_MUSIC_TRACKS.length > 0;
    const controlsVisible = useIdleControls();
    const uiHidden = !controlsVisible && !paused && !settingsOpen;

    // 引擎只创建一次
    useEffect(() => {
        const voice = new VoiceEngine();
        const sound = new SoundScapeEngine();
        const music = new BackgroundMusicEngine();
        voice.onDuckChange = (ducked) => {
            sound.setDucked(ducked);
            music.setDucked(ducked);
        };
        voiceRef.current = voice;
        soundRef.current = sound;
        musicRef.current = music;

        // 恢复上次的播放列表设置
        try {
            const saved = localStorage.getItem('ambientSettings');
            if (saved) setCfg({ ...DEFAULT_AMBIENT_CONFIG, ...JSON.parse(saved) });
        } catch {
            /* noop */
        }

        return () => {
            voice.destroy();
            sound.dispose();
            music.dispose();
        };
    }, []);

    // 用户首次交互（点击或按键）时静默激活声景与音频上下文（浏览器策略友好）
    useEffect(() => {
        const unlockAudio = () => {
            void soundRef.current?.resumeAndPlay(SEASONS[seasonIdx].id);
            if (hasMusic && musicOn) {
                const track = pickTrackForSeason(SEASONS[seasonIdx].id);
                if (track) musicRef.current?.play(track);
            }
        };
        window.addEventListener('pointerdown', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, [seasonIdx, hasMusic, musicOn]);

    // 词流加载：入场后及每次应用新设置时重载（仅 words 模式）
    useEffect(() => {
        if (!started || paused || settingsOpen || mode !== 'words') return;
        let cancelled = false;
        void loadWordCards(cfg).then((cards) => {
            if (cancelled) return;
            // 如果用户手动勾选了词单，过滤只保留用户勾选的单词
            let pool = cards;
            if (cfg.customWordList && cfg.customWordList.length > 0) {
                const allowed = new Set(cfg.customWordList);
                const filtered = cards.filter((c) => allowed.has(c.word));
                if (filtered.length > 0) pool = filtered;
            }
            const list = cfg.shuffle ? sampleWords(pool, pool.length) : [...pool];
            setWords(list.slice(0, Math.max(cfg.groupSize, 10)));
            setWordIdx(0);
            setEntries([]);
        });
        return () => {
            cancelled = true;
        };
    }, [started, paused, settingsOpen, cfg, mode]);

    // 应用设置（持久化 + 重载词流）
    const applySettings = useCallback((next: AmbientConfig) => {
        try {
            localStorage.setItem('ambientSettings', JSON.stringify(next));
        } catch {
            /* noop */
        }
        voiceRef.current?.stop();
        setCfg(next);
        setSettingsOpen(false);
    }, []);

    // 词卡交叉淡切：新词立即进场，旧词同步退场，两者重叠 ~2s
    const pushCard = useCallback((card: AmbientWordCard) => {
        const id = ++entryIdRef.current;
        setEntries((prev) => [
            ...prev.map((e) => ({ ...e, leaving: true })),
            { id, card, leaving: false },
        ]);
        window.setTimeout(() => {
            setEntries((prev) => prev.filter((e) => e.id === id || !e.leaving));
        }, 2400);
    }, []);

    // 词卡生命周期：进场 → 定时朗读 → 结束换下一张（新旧交叉重叠）
    const wordMs = cfg.durationMs;
    useEffect(() => {
        if (!started || paused || settingsOpen || words.length === 0 || mode !== 'words') return;
        const card = words[wordIdx % words.length];
        pushCard(card);

        const timers: number[] = [
            window.setTimeout(() => voiceRef.current?.speak(card.word, 0.88), SPEAK_WORD_AT_MS),
            window.setTimeout(() => {
                if (card.definition) voiceRef.current?.speak(card.definition, 0.98);
                else if (card.example) voiceRef.current?.speak(card.example, 0.95);
            }, SPEAK_DEF_AT_MS),
            window.setTimeout(() => {
                setShownCount((c) => c + 1);
                setWordIdx((i) => (i + 1) % words.length);
            }, wordMs),
        ];
        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [wordIdx, words, started, paused, settingsOpen, wordMs, pushCard, mode]);

    // 季节切换，1000ms 冷却仅拦截手动连点；视频收尾的自动衔接用 force 绕过
    const seasonCooldownRef = useRef(0);
    const switchSeason = useCallback(
        (idx: number, force = false) => {
            const now = Date.now();
            if (!force && now - seasonCooldownRef.current < SEASON_COOLDOWN_MS) return;
            seasonCooldownRef.current = now;
            setSeasonIdx(idx);
            soundRef.current?.switchSeason(SEASONS[idx].id);
            if (hasMusic && musicOn) {
                const track = pickTrackForSeason(SEASONS[idx].id);
                if (track) musicRef.current?.play(track);
            }
        },
        [hasMusic, musicOn],
    );

    // 视频临近结尾 → 无缝切到下一场景（收尾衔接，绕过冷却确保不吞事件）
    const handleSceneNearEnd = useCallback(() => {
        switchSeason((seasonIdx + 1) % SEASONS.length, true);
    }, [switchSeason, seasonIdx]);

    // 暂停/恢复
    const togglePause = useCallback(() => {
        setPaused((p) => {
            if (p) {
                void soundRef.current?.resumeAndPlay(SEASONS[seasonIdx].id);
                if (hasMusic && musicOn) {
                    const track = pickTrackForSeason(SEASONS[seasonIdx].id);
                    if (track) musicRef.current?.play(track);
                }
            } else {
                voiceRef.current?.stop();
                soundRef.current?.suspend();
                musicRef.current?.stop();
            }
            return !p;
        });
    }, [seasonIdx, hasMusic, musicOn]);

    // 背景音乐开关
    const toggleMusic = useCallback(() => {
        setMusicOn((on) => {
            if (on) {
                musicRef.current?.stop();
            } else {
                const track = pickTrackForSeason(SEASONS[seasonIdx].id);
                if (track) musicRef.current?.play(track);
            }
            return !on;
        });
    }, [seasonIdx]);

    const switchMode = useCallback((nextMode: 'words' | 'reading') => {
        if (nextMode === mode) return;
        voiceRef.current?.stop();
        setEntries([]);
        setMode(nextMode);
    }, [mode]);

    // 音量与语音开关（音量滑杆同时控制声景与背景音乐）
    useEffect(() => {
        soundRef.current?.setVolume(volume);
        musicRef.current?.setVolume(volume);
    }, [volume]);
    useEffect(() => {
        voiceRef.current?.setEnabled(voiceOn);
    }, [voiceOn]);

    // ESC / 空格 快捷键
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (settingsOpen) setSettingsOpen(false);
                else router.back();
            }
            if (e.code === 'Space' && !settingsOpen) {
                e.preventDefault();
                togglePause();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [router, togglePause, settingsOpen]);

    return (
        <div className="fixed inset-0 z-[100] select-none overflow-hidden bg-black">
            {/* z0 视频层 */}
            <SceneVideoLayer active={seasonIdx} onNearEnd={handleSceneNearEnd} />

            {/* z1 PNG 覆盖层（train-bob + scale 1.03，对齐原规格） */}
            <div
                className="train-bob pointer-events-none absolute inset-0 z-[1] bg-cover bg-center"
                style={{ backgroundImage: `url('${OVERLAY_PNG}')`, transform: 'translateZ(0)', willChange: 'transform' }}
            />

            {/* z5 全屏外框（玻璃渐变描边语言，纯装饰不挡交互） */}
            <div className="ambient-frame z-[5]" aria-hidden="true" />

            {/* z3 时钟 */}
            {started && (
                <div className={`ambient-fade ${uiHidden ? 'ambient-hidden' : ''}`}>
                    <AmbientClock season={season} />
                </div>
            )}

            {/* z3 单词浮层卡（固定高度舞台，新旧两卡同台交叉淡切；仅 words 模式） */}
            {started && mode === 'words' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[20%] z-[3] flex justify-center px-6">
                    <div className="relative flex h-[180px] w-full max-w-2xl items-center justify-center sm:h-[210px]">
                        {entries.map((entry) => (
                            <div
                                key={entry.id}
                                className={`absolute inset-0 flex items-center justify-center ${
                                    entry.leaving ? 'pointer-events-none' : 'pointer-events-auto'
                                }`}
                            >
                                <WordFloatCard
                                    card={entry.card}
                                    exiting={entry.leaving}
                                    onReplay={() => {
                                        voiceRef.current?.stop();
                                        voiceRef.current?.speak(entry.card.word, 0.85);
                                        window.setTimeout(() => {
                                            if (entry.card.definition)
                                                voiceRef.current?.speak(entry.card.definition, 0.98);
                                        }, 900);
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* z3 沉浸式文章听读（reading 模式） */}
            {started && mode === 'reading' && (
                <ReadingMode
                    apiRef={readerApiRef}
                    onPlayingChange={setReaderPlaying}
                    voiceEngineRef={voiceRef}
                    paused={paused || settingsOpen}
                    voiceOn={voiceOn}
                    season={season}
                    autoStartId={kioskArticleId}
                    onSpeakingChange={(speaking) => {
                        soundRef.current?.setDucked(speaking);
                        musicRef.current?.setDucked(speaking);
                    }}
                />
            )}

            {/* z3 右下角今日统计 */}
            {started && shownCount > 0 && (
                <div
                    className={`ambient-fade absolute bottom-6 right-6 z-[3] text-xs text-white/35 sm:text-sm ${
                        uiHidden ? 'ambient-hidden' : ''
                    }`}
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                >
                    {shownCount} word{shownCount === 1 ? '' : 's'} tonight
                </div>
            )}

            {/* z4 控件条（活动时浮现） */}
            {started && (
                <div
                    className={`ambient-fade absolute inset-x-0 bottom-8 z-[4] flex flex-wrap items-center justify-center gap-2 px-3 sm:gap-4 ${
                        uiHidden ? 'ambient-hidden' : ''
                    }`}
                >
                    {mode === 'words' ? (
                        /* ── Words 模式：单词流控制 ── */
                        <React.Fragment>
                            <button
                                type="button"
                                onClick={togglePause}
                                aria-label={paused ? '继续' : '暂停听力流'}
                                className="liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:text-white"
                            >
                                {paused ? <Play size={17} /> : <Pause size={17} />}
                            </button>
                            <button
                                type="button"
                                aria-label="下一个单词"
                                onClick={() => {
                                    voiceRef.current?.stop();
                                    if (words.length > 0) setWordIdx((i) => (i + 1) % words.length);
                                }}
                                className="liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:text-white"
                            >
                                <SkipForward size={17} />
                            </button>
                        </React.Fragment>
                    ) : (
                        /* ── Reading 模式：句子听读控制 ── */
                        <React.Fragment>
                            <button
                                type="button"
                                onClick={() => readerApiRef.current?.prevSentence()}
                                aria-label="上一句"
                                className="liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:text-white"
                            >
                                <ChevronLeft size={17} />
                            </button>
                            <button
                                type="button"
                                onClick={() => readerApiRef.current?.togglePlay()}
                                aria-label={readerPlaying ? '暂停朗读' : '继续朗读'}
                                className="liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:text-white"
                            >
                                {readerPlaying && !paused ? <Pause size={17} /> : <Play size={17} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => readerApiRef.current?.nextSentence()}
                                aria-label="下一句"
                                className="liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:text-white"
                            >
                                <ChevronRight size={17} />
                            </button>
                        </React.Fragment>
                    )}

                    <div
                        role="tablist"
                        aria-label="沉浸听读模式"
                        className="liquid-glass flex h-11 items-center gap-0.5 rounded-full p-1"
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === 'words'}
                            aria-label="单词听读"
                            title="单词听读"
                            onClick={() => switchMode('words')}
                            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs transition sm:px-3.5 ${
                                mode === 'words'
                                    ? 'border border-cyan-200/25 bg-cyan-300/15 text-cyan-100 shadow-[0_0_18px_rgba(103,232,249,0.12)]'
                                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
                            }`}
                        >
                            <BookOpenText size={14} />
                            <span>单词</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === 'reading'}
                            aria-label="文章听读"
                            title="文章听读"
                            onClick={() => switchMode('reading')}
                            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs transition sm:px-3.5 ${
                                mode === 'reading'
                                    ? 'border border-cyan-200/25 bg-cyan-300/15 text-cyan-100 shadow-[0_0_18px_rgba(103,232,249,0.12)]'
                                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
                            }`}
                        >
                            <BookOpen size={14} />
                            <span>文章</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        aria-label={mode === 'words' ? '切换到沉浸式阅读' : '切换到单词听力流'}
                        title={mode === 'words' ? 'Reading Mode · 沉浸式文章听读' : 'Words Mode · 单词听力流'}
                        onClick={() => {
                            voiceRef.current?.stop();
                            setEntries([]);
                            setMode((m) => (m === 'words' ? 'reading' : 'words'));
                        }}
                        className={`hidden liquid-glass ambient-ctl flex h-11 items-center gap-2 rounded-full px-4 text-sm ${
                            mode === 'reading' ? 'text-white' : 'text-white/85 hover:text-white'
                        }`}
                    >
                        <BookOpen size={15} />
                        <span className="hidden sm:inline">{mode === 'words' ? 'Read' : 'Words'}</span>
                    </button>

                    {mode === 'words' && (
                        <button
                            type="button"
                            aria-label="播放列表设置"
                            title="播放列表设置"
                            onClick={() => setSettingsOpen(true)}
                            className="liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:text-white"
                        >
                            <ListMusic size={17} />
                        </button>
                    )}

                    {mode === 'reading' && (
                        <button
                            type="button"
                            aria-label="选择文章"
                            title="选择文章 / AI 生成"
                            onClick={() => readerApiRef.current?.openLibrary()}
                            className="liquid-glass ambient-ctl flex h-11 items-center gap-2 rounded-full px-4 text-sm text-white/85 hover:text-white"
                        >
                            <ListMusic size={15} />
                            <span className="hidden sm:inline">Library</span>
                        </button>
                    )}

                    {hasMusic && (
                        <button
                            type="button"
                            aria-label={musicOn ? '关闭背景音乐' : '开启背景音乐'}
                            onClick={toggleMusic}
                            className={`liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full ${
                                musicOn ? 'text-white hover:text-white' : 'text-white/40 hover:text-white/70'
                            }`}
                        >
                            <Music size={17} />
                        </button>
                    )}

                    <div className="liquid-glass flex h-11 items-center gap-2 rounded-full px-4">
                        <button
                            type="button"
                            aria-label={voiceOn ? '关闭朗读' : '开启朗读'}
                            onClick={() => setVoiceOn((v) => !v)}
                            className="text-white/85 transition-colors duration-300 hover:text-white"
                        >
                            {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={volume}
                            onChange={(e) => setVolume(Number(e.target.value))}
                            className="ambient-volume"
                            aria-label="环境音音量"
                        />
                    </div>

                    <div className="liquid-glass flex h-11 items-center gap-1 rounded-full px-3">
                        {SEASONS.map((sn, i) => (
                            <button
                                key={sn.id}
                                type="button"
                                title={sn.label}
                                onClick={() => switchSeason(i)}
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all duration-300 ease-in-out ${
                                    i === seasonIdx ? 'scale-110 bg-white/20' : 'opacity-55 hover:opacity-90'
                                }`}
                            >
                                {sn.emoji}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        aria-label="退出屏保模式"
                        onClick={() => router.back()}
                        className="liquid-glass ambient-ctl flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:text-white"
                    >
                        <X size={17} />
                    </button>
                </div>
            )}

            {/* 播放列表设置面板 */}
            {started && settingsOpen && (
                <AmbientSettings cfg={cfg} onApply={applySettings} onClose={() => setSettingsOpen(false)} />
            )}
        </div>
    );
}
