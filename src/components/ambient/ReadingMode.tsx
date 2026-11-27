'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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

interface RawArticleDetail {
    id?: string;
    title?: string;
    titleZh?: string | null;
    level?: string;
    season?: string | null;
    source?: string;
    wordCount?: number;
    paragraphs?: Array<{
        en?: string;
        zh?: string;
        audioUrl?: string;
        text_en?: string;
        text_zh?: string;
        audio_url?: string;
    }>;
}

function normalizeSeedKey(id: string): string | null {
    const match = /^(?:seed|fallback)-(\d+)$/.exec(id);
    return match ? `seed-${Number(match[1])}` : null;
}

function findMatchingArticle(list: ArticleData[], targetId: string): ArticleData | undefined {
    const exact = list.find((a) => a.id === targetId);
    if (exact) return exact;
    const normalizedTarget = normalizeSeedKey(targetId);
    if (!normalizedTarget) return undefined;
    return list.find((a) => normalizeSeedKey(a.id) === normalizedTarget);
}

function toArticleData(raw: RawArticleDetail, fallbackId: string): ArticleData | null {
    if (!raw || typeof raw.title !== 'string' || !raw.title.trim() || !Array.isArray(raw.paragraphs)) {
        return null;
    }
    const paragraphs = raw.paragraphs
        .map((p) => {
            const en = String(p?.en ?? p?.text_en ?? '').trim();
            const zhRaw = p?.zh ?? p?.text_zh;
            const audioRaw = p?.audioUrl ?? p?.audio_url;
            return {
                en,
                zh: typeof zhRaw === 'string' && zhRaw.trim() ? zhRaw.trim() : undefined,
                audioUrl: typeof audioRaw === 'string' && audioRaw.trim() ? audioRaw.trim() : undefined,
            };
        })
        .filter((p) => p.en.length > 0);

    if (paragraphs.length === 0) return null;

    const wordCount =
        typeof raw.wordCount === 'number' && raw.wordCount > 0
            ? raw.wordCount
            : paragraphs.reduce((acc, p) => acc + p.en.split(/\s+/).length, 0);

    return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : fallbackId,
        title: raw.title.trim(),
        titleZh: typeof raw.titleZh === 'string' ? raw.titleZh : null,
        level: typeof raw.level === 'string' && raw.level.trim() ? raw.level : 'B1',
        season: typeof raw.season === 'string' ? raw.season : null,
        source: typeof raw.source === 'string' ? raw.source : undefined,
        paragraphs,
        wordCount,
    };
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
    const t = useTranslations('ambient.reading');
    const [articles, setArticles] = useState<ArticleData[]>([]);
    const loadKey = autoStartId ?? '__default__';
    const [loadState, setLoadState] = useState<{ key: string; loading: boolean; error: string | null }>({
        key: '',
        loading: true,
        error: null,
    });
    const loadingList = loadState.key !== loadKey || loadState.loading;
    const loadError = loadState.key === loadKey ? loadState.error : null;
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
    const reportSpeakingRef = useRef(reportSpeaking);
    useEffect(() => {
        reportSpeakingRef.current = reportSpeaking;
    }, [reportSpeaking]);

    // 包装 voice engine：朗读状态上报给父级做 ducking
    const wrappedVoiceRef = useRef<{
        speak: (t: string, r?: number, onEnd?: () => void) => void;
        stop: () => void;
    } | null>(null);
    useEffect(() => {
        wrappedVoiceRef.current = {
            speak: (text, rate, onEnd) => {
                reportSpeakingRef.current(true);
                voiceEngineRef.current?.speak(text, rate, () => {
                    reportSpeakingRef.current(false);
                    onEnd?.();
                });
            },
            stop: () => {
                reportSpeakingRef.current(false);
                voiceEngineRef.current?.stop();
            },
        };
    }, [voiceEngineRef]);

    const reader = useArticleReader({
        voiceEngineRef: wrappedVoiceRef,
        paused,
        voiceOn,
    });

    // 加载文章列表，若指定 autoStartId 且未命中列表则按 ID 回退请求 /api/articles/[id]
    useEffect(() => {
        let cancelled = false;

        async function loadInitialArticles() {
            let list: ArticleData[] = [];
            try {
                const res = await fetch('/api/ambient/articles');
                if (res.ok) {
                    const data: unknown = await res.json();
                    if (Array.isArray(data)) list = data as ArticleData[];
                }
            } catch {
                /* 保留空列表，继续尝试按 ID 加载 */
            }
            if (cancelled) return;
            setArticles(list);

            if (autoStartId) {
                const matched = findMatchingArticle(list, autoStartId);
                if (matched) {
                    reader.setArticle(matched);
                    setLoadState({ key: loadKey, loading: false, error: null });
                    return;
                }

                try {
                    const detailRes = await fetch(`/api/articles/${encodeURIComponent(autoStartId)}`);
                    if (cancelled) return;
                    if (detailRes.ok) {
                        const rawDetail: RawArticleDetail = await detailRes.json();
                        if (cancelled) return;
                        const converted = toArticleData(rawDetail, autoStartId);
                        if (converted) {
                            setArticles((prev) =>
                                prev.some((a) => a.id === converted.id) ? prev : [converted, ...prev],
                            );
                            reader.setArticle(converted);
                            setLoadState({ key: loadKey, loading: false, error: null });
                            return;
                        }
                    }
                } catch {
                    /* 转入错误展示 */
                }

                if (!cancelled) {
                    setLoadState({ key: loadKey, loading: false, error: t('articleLoadFailed') });
                }
                return;
            }

            if (list.length > 0 && !reader.article) {
                const preferred = list.find((a) => a.season === season) || list[0];
                reader.setArticle(preferred);
            }
            setLoadState({ key: loadKey, loading: false, error: null });
        }

        void loadInitialArticles();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStartId, loadKey]);

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
        setLoadState({ key: loadKey, loading: false, error: null });
        reader.setArticle(a);
        setPickerOpen(false);
    };

    const uiHidden = !controlsVisible && !paused;

    // 向父级暴露操作接口（每次渲染刷新闭包）
    useEffect(() => {
        if (!apiRef) return;
        apiRef.current = {
            prevSentence: () => reader.jumpTo(Math.max(0, reader.cursor - 1)),
            nextSentence: () => reader.jumpTo(Math.min(Math.max(0, reader.totalSentences - 1), reader.cursor + 1)),
            togglePlay: () => reader.setPlaying((p) => !p),
            openLibrary: () => setPickerOpen(true),
        };
    });

    if (loadingList && !reader.article) {
        return (
            <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3">
                <Loader2 size={22} className="animate-spin text-white/50" />
                <span className="text-xs text-white/40" style={{ fontFamily: 'system-ui, sans-serif' }}>
                    {t('opening')}
                </span>
            </div>
        );
    }

    return (
        <>
            {/* 指定文章加载失败提示（不静默播放别篇） */}
            {loadError && !reader.article && (
                <div className="absolute inset-0 z-[3] flex items-center justify-center px-6">
                    <div
                        role="alert"
                        className="liquid-glass flex max-w-md flex-col items-center gap-4 rounded-3xl border border-white/15 bg-black/50 px-7 py-6 text-center backdrop-blur-md"
                        style={{ fontFamily: 'system-ui, sans-serif' }}
                    >
                        <p className="text-sm text-rose-200">{loadError}</p>
                        <button
                            type="button"
                            onClick={() => setPickerOpen(true)}
                            className="rounded-full bg-white px-5 py-2 text-xs font-medium text-black transition-all hover:bg-white/90"
                        >
                            {t('chooseAnother')}
                        </button>
                    </div>
                </div>
            )}

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
                    {reader.totalSentences > 0 && (
                        <div
                            className="mt-1.5 text-[11px] tabular-nums text-white/30"
                            style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                            {reader.cursor + 1} / {reader.totalSentences}
                        </div>
                    )}
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
