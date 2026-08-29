'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import SentenceCard from './SentenceCard';
import ArticlePicker from './ArticlePicker';
import { useArticleReader } from './useArticleReader';
import type { ArticleData } from './useArticleReader';

/**
 * ReadingMode —— 沉浸式文章听读主容器。
 *
 * 四季视频/粒子/外框/声景由 AmbientScreen 托管，这里只负责：
 * 句队列调度（useArticleReader）+ SentenceCard 浮层 + 极简控制条 + 选文面板。
 */

export interface ReadingApi {
    prevSentence: () => void;
    nextSentence: () => void;
    togglePlay: () => void;
    openLibrary: () => void;
}

export default function ReadingMode({
    voiceEngineRef,
    paused,
    voiceOn,
    season,
    onSpeakingChange,
    autoStartId,
    apiRef,
    onPlayingChange,
}: {
    voiceEngineRef: React.MutableRefObject<{ speak: (t: string, r?: number, onEnd?: () => void) => void; stop: () => void } | null>;
    paused: boolean;
    voiceOn: boolean;
    season: string;
    /** 朗读时通知父级对声景/音乐做 ducking */
    onSpeakingChange: (speaking: boolean) => void;
    /** kiosk 模式指定的初始文章 id（?article=xxx） */
    autoStartId?: string;
    /** 向父级暴露操作接口，由父级统一渲染控制条（避免双条重叠） */
    apiRef?: React.MutableRefObject<ReadingApi | null>;
    /** 播放状态上报（父级控制条渲染播放/暂停图标用） */
    onPlayingChange?: (playing: boolean) => void;
}) {
    const [articles, setArticles] = useState<ArticleData[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);

    const speakingRef = useRef(false);
    const reportSpeaking = useCallback(
        (on: boolean) => {
            if (speakingRef.current !== on) {
                speakingRef.current = on;
                onSpeakingChange(on);
            }
        },
        [onSpeakingChange],
    );

    // 包装 voice engine：朗读状态上报给父级做 ducking
    const wrappedVoiceRef = useRef<{
        speak: (t: string, r?: number, onEnd?: () => void) => void;
        stop: () => void;
    } | null>(null);
    if (!wrappedVoiceRef.current) {
        wrappedVoiceRef.current = {
            speak: (text, rate, onEnd) => {
                reportSpeaking(true);
                voiceEngineRef.current?.speak(text, rate, () => {
                    reportSpeaking(false);
                    onEnd?.();
                });
            },
            stop: () => {
                reportSpeaking(false);
                voiceEngineRef.current?.stop();
            },
        };
    }

    const reader = useArticleReader({
        voiceEngineRef: wrappedVoiceRef,
        paused,
        voiceOn,
    });

    // 加载文章列表
    useEffect(() => {
        let cancelled = false;
        void fetch('/api/ambient/articles')
            .then((r) => (r.ok ? r.json() : []))
            .then((data: ArticleData[]) => {
                if (cancelled || !Array.isArray(data)) return;
                setArticles(data);
                setLoadingList(false);
                if (data.length > 0 && !reader.article) {
                    const preferred =
                        (autoStartId && data.find((a) => a.id === autoStartId)) ||
                        data.find((a) => a.season === season) ||
                        data[0];
                    reader.setArticle(preferred);
                }
            })
            .catch(() => {
                if (!cancelled) setLoadingList(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        onPlayingChange?.(reader.playing);
    }, [reader.playing, onPlayingChange]);

    // 控件自动隐藏（性能纪律：仅在可见性真正变化时 setState，mousemove 走 rAF 节流）
    const controlsVisibleRef = useRef(true);
    useEffect(() => {
        let timer = 0;
        let raf = 0;
        const setVisible = (v: boolean) => {
            if (controlsVisibleRef.current === v) return;
            controlsVisibleRef.current = v;
            setControlsVisible(v);
        };
        const wake = () => {
            setVisible(true);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setVisible(false), 3200);
        };
        const onMouseMove = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                wake();
            });
        };
        wake();
        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('touchstart', wake, { passive: true });
        window.addEventListener('keydown', wake);
        return () => {
            window.clearTimeout(timer);
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('touchstart', wake);
            window.removeEventListener('keydown', wake);
        };
    }, []);

    const selectArticle = (a: ArticleData) => {
        reader.setArticle(a);
        setPickerOpen(false);
    };

    const uiHidden = !controlsVisible && !paused;

    // 向父级暴露操作接口（每次渲染刷新闭包）
    useEffect(() => {
        if (!apiRef) return;
        apiRef.current = {
            prevSentence: () => reader.jumpTo(Math.max(0, reader.cursor - 1)),
            nextSentence: () => reader.jumpTo(Math.min(reader.totalSentences - 1, reader.cursor + 1)),
            togglePlay: () => reader.setPlaying((p) => !p),
            openLibrary: () => setPickerOpen(true),
        };
    });

    if (loadingList && !reader.article) {
        return (
            <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3">
                <Loader2 size={22} className="animate-spin text-white/50" />
                <span className="text-xs text-white/40" style={{ fontFamily: 'system-ui, sans-serif' }}>
                    正在打开阅读世界…
                </span>
            </div>
        );
    }

    return (
        <>
            {/* 文章标题角标 */}
            {reader.article && (
                <div
                    className={`ambient-fade absolute left-6 top-24 z-[3] max-w-[280px] sm:left-10 ${
                        uiHidden ? 'ambient-hidden' : ''
                    }`}
                >
                    <div
                        className="font-serif-display text-lg italic leading-snug text-white/60"
                        style={{ fontFamily: "'Instrument Serif', serif" }}
                    >
                        “{reader.article.title}”
                    </div>
                    {reader.article.titleZh && (
                        <div className="mt-1 text-xs text-white/35" style={{ fontFamily: 'system-ui, sans-serif' }}>
                            {reader.article.titleZh}
                        </div>
                    )}
                    <div
                        className="mt-1.5 text-[11px] tabular-nums text-white/30"
                        style={{ fontFamily: 'system-ui, sans-serif' }}
                    >
                        {reader.cursor + 1} / {reader.totalSentences}
                    </div>
                </div>
            )}

            {/* 句卡浮层（视觉中心） */}
            {reader.current && (
                <div className="absolute inset-x-0 bottom-[18%] z-[3] flex justify-center">
                    <SentenceCard
                        sentence={reader.current}
                        prevSentence={reader.prevSentence}
                        nextSentence={reader.nextSentence}
                        spokenWords={reader.spokenWords}
                        showZh={reader.showZh}
                    />
                </div>
            )}

            {/* 选文面板 */}
            {pickerOpen && (
                <ArticlePicker
                    articles={articles}
                    currentId={reader.article?.id}
                    loading={loadingList}
                    onSelect={selectArticle}
                    onGenerated={(a) => {
                        setArticles((prev) => [a, ...prev]);
                        selectArticle(a);
                    }}
                    onClose={() => setPickerOpen(false)}
                    season={season}
                />
            )}
        </>
    );
}
