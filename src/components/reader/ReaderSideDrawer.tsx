'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookmarkPlus, Check, Compass, GripVertical, Layers, Loader2, MessageSquare, Sparkles, X } from 'lucide-react';
import PanelFissionGraph from '@/components/PanelFissionGraph';

interface WordDetails {
    word: string;
    phonetic?: string;
    translation?: string;
    definition?: string;
    roots?: string[];
    meanings?: string[];
}

export default function ReaderSideDrawer({
    word: initialWord,
    sentenceText,
    onClose,
    onWidthChange,
}: {
    word?: string;
    sentenceText?: string;
    onClose: () => void;
    onWidthChange?: (width: number) => void;
}) {
    const t = useTranslations('reader.drawer');
    const [word, setWord] = useState<string | undefined>(initialWord);
    const [tab, setTab] = useState<'fission' | 'grammar' | 'ai'>('fission');
    const [wordData, setWordData] = useState<WordDetails | null>(null);
    const [loadingWord, setLoadingWord] = useState(false);
    const [collecting, setCollecting] = useState(false);
    const [collected, setCollected] = useState(false);
    const [panelWidth, setPanelWidth] = useState(480);
    const resizingRef = useRef(false);

    // AI 助教状态
    const [question, setQuestion] = useState('');
    const [aiReply, setAiReply] = useState('');
    const [asking, setAsking] = useState(false);

    // 语法分级状态
    const [grammarLevel, setGrammarLevel] = useState<'low' | 'mid' | 'high'>('mid');

    useEffect(() => {
        setWord(initialWord);
    }, [initialWord]);

    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem('reader-cognitive-width'));
            if (Number.isFinite(saved) && saved >= 340 && saved <= 760) {
                setPanelWidth(saved);
                onWidthChange?.(saved);
            } else {
                onWidthChange?.(480);
            }
        } catch {
            /* use default width */
        }
    }, [onWidthChange]);

    useEffect(() => {
        const onMove = (event: PointerEvent) => {
            if (!resizingRef.current) return;
            const next = Math.min(760, Math.max(340, window.innerWidth - event.clientX));
            setPanelWidth(next);
            onWidthChange?.(next);
            try {
                localStorage.setItem('reader-cognitive-width', String(next));
            } catch {
                /* noop */
            }
        };
        const onUp = () => {
            resizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, []);

    const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        resizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    // 查词与释义数据
    useEffect(() => {
        if (!word) {
            setWordData(null);
            return;
        }
        setLoadingWord(true);
        setCollected(false);

        void fetch(`/api/words/${encodeURIComponent(word)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) {
                    const chinese = data.chinese || data.chineseData || data;
                    const meanings = Array.isArray(chinese?.definitions)
                        ? chinese.definitions
                            .map((item: { meaning?: string; definition?: string; chinese?: string; explanation_en?: string; explanation_cn?: string }) => item.explanation_en || item.meaning || item.definition || item.chinese || item.explanation_cn)
                            .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
                        : [];
                    setWordData({
                        word,
                        phonetic: chinese.phonetic || chinese.pronunciation || data.phonetic,
                        translation: chinese.concise_definition || chinese.translation || data.translation,
                        definition: data.content || chinese.definition,
                        meanings,
                    });
                } else {
                    setWordData({ word, translation: t('selectedWordFallback') });
                }
            })
            .catch(() => {
                setWordData({ word, translation: t('selectedWordFallback') });
            })
            .finally(() => setLoadingWord(false));
    }, [word, t]);

    // 收藏进生词库
    const handleCollect = async () => {
        if (!word || collecting || collected) return;
        setCollecting(true);
        try {
            const res = await fetch('/api/user/libraries/collect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word, libraryName: '阅读生词' }),
            });
            if (res.ok) {
                setCollected(true);
            }
        } catch (e) {
            console.error('Collect failed:', e);
        } finally {
            setCollecting(false);
        }
    };

    // DeepSeek 助教问答
    const handleAskAi = async () => {
        if (!question.trim() || asking) return;
        setAsking(true);
        setAiReply('');
        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    newMessage: t('aiPrompt', { sentence: sentenceText || '', question }),
                    messages: [],
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setAiReply(data.reply || data.content || t('aiAck'));
            }
        } catch {
            setAiReply(t('aiError'));
        } finally {
            setAsking(false);
        }
    };

    return (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/15 bg-black/95 shadow-2xl backdrop-blur-2xl sm:max-w-none" style={{ width: `min(${panelWidth}px, 100vw)` }}>
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('resize')}
                onPointerDown={beginResize}
                className="group absolute inset-y-0 -left-2 z-10 hidden w-4 cursor-col-resize items-center justify-center sm:flex"
            >
                <span className="flex h-16 w-1 items-center justify-center rounded-full bg-white/10 transition group-hover:bg-cyan-300/70">
                    <GripVertical size={14} className="text-white/30 transition group-hover:text-cyan-100" />
                </span>
            </div>
            {/* 顶部标题与 Tab */}
            <div className="border-b border-white/10 p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Compass size={18} className="text-cyan-400" />
                        <h3 className="font-serif-display text-xl italic text-white" style={{ fontFamily: "'Instrument Serif', serif" }}>
                            {t('title')}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>

                {word && (
                    <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-baseline gap-2">
                                    <span className="font-serif-display text-3xl italic text-white" style={{ fontFamily: "'Instrument Serif', serif" }}>{word}</span>
                                    {wordData?.phonetic && <span className="text-xs text-white/50">[{wordData.phonetic}]</span>}
                                </div>
                                {loadingWord ? <p className="mt-2 text-xs text-white/45">{t('loadingWord')}</p> : wordData?.translation && <p className="mt-2 text-sm leading-relaxed text-white/80">{wordData.translation}</p>}
                            </div>
                            <button type="button" onClick={handleCollect} disabled={collected || collecting} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${collected ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                                {collected ? <Check size={13} /> : <BookmarkPlus size={13} />}
                                <span>{collected ? t('saved') : t('save')}</span>
                            </button>
                        </div>
                        {wordData?.meanings && wordData.meanings.length > 0 && (
                            <div className="mt-3 border-t border-white/10 pt-3">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/70">Definitions</p>
                                <div className="space-y-1.5 text-xs leading-relaxed text-white/65">
                                    {wordData.meanings.slice(0, 6).map((meaning, index) => <p key={`${meaning}-${index}`}><span className="mr-2 text-white/35">{index + 1}.</span>{meaning}</p>)}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-4 flex gap-2">
                    {[
                        { id: 'fission', label: t('tabs.fission'), icon: Layers },
                        { id: 'grammar', label: t('tabs.grammar'), icon: Compass },
                        { id: 'ai', label: t('tabs.ai'), icon: MessageSquare },
                    ].map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id as 'fission' | 'grammar' | 'ai')}
                            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
                                tab === item.id
                                    ? 'bg-white/15 text-white shadow-sm'
                                    : 'text-white/45 hover:bg-white/[0.04] hover:text-white'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
                {/* ── Tab 1: 单词星图与词根 ── */}
                {tab === 'fission' && (
                    <div className="space-y-4">
                        {!word ? (
                            <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-white/40">
                                <span>{t('emptyHint1')}<br />{t('emptyHint2')}</span>
                            </div>
                        ) : (
                            <>
                                {/* 单词基础卡 */}
                                <div className="hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                    <div className="flex items-baseline justify-between">
                                        <div className="flex items-baseline gap-3">
                                            <span className="font-serif-display text-3xl italic text-white" style={{ fontFamily: "'Instrument Serif', serif" }}>
                                                {word}
                                            </span>
                                            {wordData?.phonetic && (
                                                <span className="text-xs text-white/50">[{wordData.phonetic}]</span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleCollect}
                                            disabled={collected || collecting}
                                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                                                collected
                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                                    : 'bg-white/10 text-white hover:bg-white/20'
                                            }`}
                                        >
                                            {collected ? <Check size={13} /> : <BookmarkPlus size={13} />}
                                            <span>{collected ? t('saved') : t('save')}</span>
                                        </button>
                                    </div>

                                    {wordData?.translation && (
                                        <p className="mt-3 text-sm leading-relaxed text-white/80">
                                            {wordData.translation}
                                        </p>
                                    )}
                                    {wordData?.definition && wordData.definition !== wordData.translation && (
                                        <p className="mt-2 text-xs leading-relaxed text-white/55">{wordData.definition}</p>
                                    )}
                                </div>

                                {/* 嵌入式 2D 裂变星图 */}
                                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/60 relative">
                                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] text-white/50">
                                        <span>{t('fissionHeader')}</span>
                                        <span className="text-[10px] text-cyan-400">{t('fissionHint')}</span>
                                    </div>
                                    <div className="h-[420px] w-full sm:h-[460px]">
                                        <PanelFissionGraph
                                            word={word}
                                            onNodeClick={(node) => {
                                                if (node?.id) setWord(node.id);
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* 词根衍生提示 */}
                                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">
                                    <div className="font-semibold text-white/90">{t('fsrsTitle')}</div>
                                    <p className="mt-1.5 leading-relaxed text-white/50">
                                        {t.rich('fsrsBody', { strong: (chunks) => <strong>{chunks}</strong> })}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── Tab 2: 语法解析 ── */}
                {tab === 'grammar' && (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            {(['low', 'mid', 'high'] as const).map((lv) => (
                                <button
                                    key={lv}
                                    type="button"
                                    onClick={() => setGrammarLevel(lv)}
                                    className={`flex-1 rounded-xl border py-1.5 text-xs font-medium transition-all ${
                                        grammarLevel === lv
                                            ? 'border-white/50 bg-white/15 text-white'
                                            : 'border-white/10 text-white/40 hover:text-white'
                                    }`}
                                >
                                    {lv === 'low' ? t('grammar.low') : lv === 'mid' ? t('grammar.mid') : t('grammar.high')}
                                </button>
                            ))}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-white/70">
                            <div className="font-medium text-white/90 mb-2">{t('grammar.contextLabel')}</div>
                            <p className="italic text-white/60 font-serif-display text-sm">
                                “{sentenceText || t('grammar.selectHint')}”
                            </p>
                            <div className="mt-4 border-t border-white/10 pt-3 space-y-2">
                                {grammarLevel === 'low' && (
                                    <p>• {t.rich('grammar.lowText', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
                                )}
                                {grammarLevel === 'mid' && (
                                    <p>• {t.rich('grammar.midText', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
                                )}
                                {grammarLevel === 'high' && (
                                    <p>• {t.rich('grammar.highText', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Tab 3: DeepSeek AI 助教 ── */}
                {tab === 'ai' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-white/10 bg-black/50 p-3">
                            <textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder={t('aiPlaceholder')}
                                rows={3}
                                className="w-full bg-transparent text-xs text-white placeholder-white/30 outline-none resize-none"
                            />
                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={handleAskAi}
                                    disabled={asking || !question.trim()}
                                    className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-40"
                                >
                                    {asking ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                    <span>{asking ? t('asking') : t('ask')}</span>
                                </button>
                            </div>
                        </div>

                        {aiReply && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-relaxed text-white/80 whitespace-pre-wrap">
                                {aiReply}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}
