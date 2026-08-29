'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    MoonStar,
} from 'lucide-react';
import ReaderArticleView from '@/components/reader/ReaderArticleView';
import ReaderAudioBar from '@/components/reader/ReaderAudioBar';
import ReaderSideDrawer from '@/components/reader/ReaderSideDrawer';
import type { ReaderArticle } from '@/lib/reader-engine/types';
import { alignSentences } from '@/lib/reader-engine/sentences';

/**
 * 全息双语精读工作台 (/read/[id])
 * 融合 EchoStream 的句级分句对齐、TTS 句子流与 WordLink 的 Cyber-Crystal 点词星图裂变。
 */
export default function ReadDetailPage() {
    const params = useParams();
    const id = (params?.id as string) || '';

    const [article, setArticle] = useState<ReaderArticle | null>(null);
    const [loading, setLoading] = useState(true);

    // 播放与句子游标状态
    const [activeSentenceIdx, setActiveSentenceIdx] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1.0);

    // 抽屉状态
    const [selectedWord, setSelectedWord] = useState<string | undefined>(undefined);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerWidth, setDrawerWidth] = useState(480);

    // 句子总表
    const allSentences = useMemo(() => {
        if (!article || !article.paragraphs) return [];
        let gIdx = 0;
        return article.paragraphs.flatMap((p) => {
            const aligned = alignSentences(p.text_en, p.text_zh || '');
            return aligned.pairs.map((pair) => ({
                globalIdx: gIdx++,
                en: pair.en,
                zh: pair.zh,
            }));
        });
    }, [article]);

    // 加载文章数据
    useEffect(() => {
        if (!id) return;
        setLoading(true);
        void fetch(`/api/articles/${encodeURIComponent(id)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) setArticle(data);
            })
            .catch((err) => console.error('Failed to load article:', err))
            .finally(() => setLoading(false));
    }, [id]);

    // Web Speech API 播放驱动
    const speakTimerRef = useRef<number | null>(null);

    const stopSpeech = useCallback(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (speakTimerRef.current) {
            window.clearTimeout(speakTimerRef.current);
            speakTimerRef.current = null;
        }
    }, []);

    const playCurrentSentence = useCallback(() => {
        if (!allSentences[activeSentenceIdx] || typeof window === 'undefined' || !('speechSynthesis' in window))
            return;

        stopSpeech();
        const text = allSentences[activeSentenceIdx].en;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.rate = playbackRate * 0.9;

        utter.onend = () => {
            if (!playing) return;
            // 停顿 600ms 自动播下一句
            speakTimerRef.current = window.setTimeout(() => {
                setActiveSentenceIdx((prev) => {
                    if (prev < allSentences.length - 1) {
                        return prev + 1;
                    } else {
                        setPlaying(false);
                        return prev;
                    }
                });
            }, 600);
        };

        utter.onerror = () => {
            setPlaying(false);
        };

        window.speechSynthesis.speak(utter);
    }, [allSentences, activeSentenceIdx, playbackRate, playing, stopSpeech]);

    useEffect(() => {
        if (playing) {
            playCurrentSentence();
        } else {
            stopSpeech();
        }
        return () => stopSpeech();
    }, [playing, activeSentenceIdx, playCurrentSentence, stopSpeech]);

    // 点击单词呼出右侧抽屉
    const handleWordClick = (word: string) => {
        setSelectedWord(word);
        setDrawerOpen(true);
    };

    // 当前句子内容
    const currentSentenceText = allSentences[activeSentenceIdx]?.en || '';

    if (loading) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#08080a] text-white">
                <Loader2 size={28} className="animate-spin text-cyan-400" />
                <span className="mt-3 text-xs text-white/40">正在解构全息语境…</span>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#08080a] p-6 text-center text-white">
                <p className="text-sm text-white/50">未找到该文章</p>
                <Link
                    href="/read"
                    className="mt-4 rounded-full bg-white px-5 py-2 text-xs font-semibold text-black"
                >
                    返回语境文库
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#08080a] pb-32 text-white selection:bg-cyan-500/30">
            {/* 背景氛围渐变 */}
            <div className="pointer-events-none fixed inset-0 z-0 opacity-30">
                <div className="absolute left-1/3 top-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-[140px]" />
                <div className="absolute right-1/4 top-1/2 h-96 w-96 rounded-full bg-violet-500/10 blur-[160px]" />
            </div>

            {/* 顶部固定导航栏 */}
            <header className="sticky top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur-xl">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/read"
                            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-all hover:bg-white/10 hover:text-white"
                            title="返回语境文库"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <h1
                                className="font-serif-display text-xl italic tracking-wide text-white sm:text-2xl"
                                style={{ fontFamily: "'Instrument Serif', serif" }}
                            >
                                {article.title}
                            </h1>
                            {article.titleZh && (
                                <p className="text-xs text-white/40">{article.titleZh}</p>
                            )}
                        </div>
                    </div>

                    {/* 右上角切入屏保听读按钮 */}
                    <div className="flex items-center gap-3">
                        <Link
                            href={`/ambient?mode=reading&article=${article.id}&auto=1`}
                            className="liquid-glass group flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white/85 transition-all hover:border-cyan-400/50 hover:bg-white/10 hover:text-white"
                            title="推送到四季车窗屏保慢读"
                        >
                            <MoonStar size={14} className="text-amber-300 transition-transform group-hover:scale-110" />
                            <span className="hidden sm:inline">一键切入屏保听读</span>
                        </Link>
                    </div>
                </div>
            </header>

            {/* 主文章内容双语流 */}
            <main
                data-drawer-open={drawerOpen ? 'true' : 'false'}
                className="reader-content relative z-10 mx-auto max-w-4xl px-6 pt-8 transition-[margin-right] duration-300 sm:px-8"
                style={{ '--reader-drawer-width': `${drawerOpen ? drawerWidth : 0}px` } as React.CSSProperties}
            >
                <ReaderArticleView
                    paragraphs={article.paragraphs}
                    activeSentenceIdx={activeSentenceIdx}
                    selectedWord={selectedWord}
                    onSentenceClick={(idx) => {
                        setActiveSentenceIdx(idx);
                        setPlaying(true);
                    }}
                    onWordClick={handleWordClick}
                />
            </main>

            {/* 底部悬浮音频控制条 */}
            <ReaderAudioBar
                playing={playing}
                currentSentenceIdx={activeSentenceIdx}
                totalSentences={Math.max(allSentences.length, 1)}
                playbackRate={playbackRate}
                drawerOpen={drawerOpen}
                drawerWidth={drawerWidth}
                onTogglePlay={() => setPlaying(!playing)}
                onPrevSentence={() => {
                    setActiveSentenceIdx((prev) => Math.max(0, prev - 1));
                    setPlaying(true);
                }}
                onNextSentence={() => {
                    setActiveSentenceIdx((prev) => Math.min(allSentences.length - 1, prev + 1));
                    setPlaying(true);
                }}
                onRestart={() => {
                    setActiveSentenceIdx(0);
                    setPlaying(true);
                }}
                onChangeRate={setPlaybackRate}
            />

            {/* 右侧全息星图与语法抽屉 */}
            {drawerOpen && (
                <ReaderSideDrawer
                    word={selectedWord}
                    sentenceText={currentSentenceText}
                    onClose={() => setDrawerOpen(false)}
                    onWidthChange={setDrawerWidth}
                />
            )}
            <style jsx>{`
                @media (min-width: 640px) {
                    .reader-content[data-drawer-open='true'] {
                        width: calc(100% - var(--reader-drawer-width));
                        max-width: none;
                        margin-left: 0;
                        margin-right: var(--reader-drawer-width);
                    }
                }
            `}</style>
        </div>
    );
}
