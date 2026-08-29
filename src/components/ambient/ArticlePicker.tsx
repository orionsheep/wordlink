'use client';

import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import type { ArticleData } from './useArticleReader';

const SEASON_EMOJI: Record<string, string> = {
    spring: '🌸',
    summer: '✨',
    autumn: '🍁',
    winter: '❄️',
};

const LEVEL_COLOR: Record<string, string> = {
    A2: 'bg-emerald-400/20 text-emerald-200 border-emerald-300/30',
    B1: 'bg-sky-400/20 text-sky-200 border-sky-300/30',
    B2: 'bg-violet-400/20 text-violet-200 border-violet-300/30',
    C1: 'bg-rose-400/20 text-rose-200 border-rose-300/30',
};

/**
 * ArticlePicker —— 沉浸式阅读选文面板。
 * 左：文章列表（标题/等级/季节/词数）；右上：AI 生成入口（主题+等级）。
 */
export default function ArticlePicker({
    articles,
    currentId,
    loading,
    onSelect,
    onGenerated,
    onClose,
    season,
}: {
    articles: ArticleData[];
    currentId?: string;
    loading: boolean;
    onSelect: (a: ArticleData) => void;
    onGenerated: (a: ArticleData) => void;
    onClose: () => void;
    season: string;
}) {
    const [showGen, setShowGen] = useState(false);
    const [theme, setTheme] = useState('');
    const [level, setLevel] = useState('B1');
    const [generating, setGenerating] = useState(false);
    const [genError, setGenError] = useState('');

    const generate = async () => {
        setGenerating(true);
        setGenError('');
        try {
            const res = await fetch('/api/ambient/articles/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: theme.trim() || undefined, level, season }),
            });
            const data = await res.json();
            if (!res.ok) {
                setGenError(data?.error || '生成失败，请重试');
                return;
            }
            onGenerated(data as ArticleData);
            setShowGen(false);
            setTheme('');
        } catch {
            setGenError('网络异常，请重试');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="absolute inset-0 z-[30] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md" onClick={onClose}>
            <div
                className="liquid-glass flex h-[min(88vh,620px)] w-full max-w-lg flex-col overflow-hidden rounded-[1.8rem]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                    <div>
                        <h2
                            className="font-serif-display text-2xl italic text-white"
                            style={{ fontFamily: "'Instrument Serif', serif" }}
                        >
                            Reading Library
                        </h2>
                        <p className="mt-0.5 text-[11px] text-white/45" style={{ fontFamily: 'system-ui, sans-serif' }}>
                            沉浸式听读 · 逐句朗读 · AI 个性化生成
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭选文"
                        className="ambient-ctl flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* AI 生成入口 */}
                <div className="border-b border-white/10 px-6 py-4">
                    {!showGen ? (
                        <button
                            type="button"
                            onClick={() => setShowGen(true)}
                            className="ambient-ctl flex w-full items-center justify-between rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-left hover:bg-white/[0.1]"
                        >
                            <div className="flex items-center gap-3">
                                <Sparkles size={16} className="text-amber-300" />
                                <div>
                                    <div className="text-sm font-medium text-white">AI 生成专属短文</div>
                                    <div
                                        className="text-[11px] text-white/45"
                                        style={{ fontFamily: 'system-ui, sans-serif' }}
                                    >
                                        用你最近学的词，写一个属于你的小故事
                                    </div>
                                </div>
                            </div>
                            <ChevronHint />
                        </button>
                    ) : (
                        <div className="space-y-3" style={{ fontFamily: 'system-ui, sans-serif' }}>
                            <input
                                type="text"
                                value={theme}
                                onChange={(e) => setTheme(e.target.value)}
                                placeholder="主题（可选，如：a quiet library）"
                                className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
                            />
                            <div className="flex items-center gap-2">
                                {['A2', 'B1', 'B2', 'C1'].map((lv) => (
                                    <button
                                        key={lv}
                                        type="button"
                                        onClick={() => setLevel(lv)}
                                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-all ${
                                            level === lv
                                                ? 'border-white/60 bg-white/20 text-white'
                                                : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white'
                                        }`}
                                    >
                                        {lv}
                                    </button>
                                ))}
                            </div>
                            {genError && <p className="text-xs text-rose-300">{genError}</p>}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowGen(false);
                                        setGenError('');
                                    }}
                                    className="flex-1 rounded-xl border border-white/15 py-2.5 text-xs text-white/60 hover:text-white"
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    onClick={generate}
                                    disabled={generating}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
                                >
                                    {generating ? (
                                        <>
                                            <Loader2 size={13} className="animate-spin" /> 正在创作…
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={13} /> 生成并阅读
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 文章列表 */}
                <div className="flex-1 overflow-y-auto p-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
                    {loading ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-white/40">
                            <Loader2 size={18} className="animate-spin" /> 加载文章…
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {articles.map((a) => {
                                const isCurrent = a.id === currentId;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => onSelect(a)}
                                        className={`w-full rounded-2xl border p-4 text-left transition-all ${
                                            isCurrent
                                                ? 'border-white/50 bg-white/[0.12] shadow-lg'
                                                : 'border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.06]'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div
                                                    className="font-serif-display truncate text-lg italic text-white"
                                                    style={{ fontFamily: "'Instrument Serif', serif" }}
                                                >
                                                    {a.title}
                                                </div>
                                                {a.titleZh && (
                                                    <div className="mt-0.5 truncate text-xs text-white/45">{a.titleZh}</div>
                                                )}
                                                <div className="mt-2 flex items-center gap-2 text-[11px] text-white/40">
                                                    <span
                                                        className={`rounded-md border px-1.5 py-0.5 font-medium ${
                                                            LEVEL_COLOR[a.level] || 'border-white/20 text-white/60'
                                                        }`}
                                                    >
                                                        {a.level}
                                                    </span>
                                                    {a.season && <span>{SEASON_EMOJI[a.season]}</span>}
                                                    <span>· {a.wordCount} words</span>
                                                    {a.source === 'ai' && (
                                                        <span className="text-amber-300/70">· ✨ AI</span>
                                                    )}
                                                </div>
                                            </div>
                                            {isCurrent && (
                                                <span className="shrink-0 text-[10px] uppercase tracking-widest text-white/60">
                                                    Playing
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ChevronHint() {
    return (
        <span className="text-white/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </span>
    );
}
