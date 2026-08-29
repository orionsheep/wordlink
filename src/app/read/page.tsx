'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    BookOpen,
    Compass,
    Flame,
    Loader2,
    MoonStar,
    Search,
    Sparkles,
    TrendingUp,
    Zap,
} from 'lucide-react';
import type { ReaderArticle } from '@/lib/reader-engine/types';

const LEVEL_COLOR: Record<string, string> = {
    A2: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    B1: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    B2: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    C1: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

const CATEGORIES = [
    { id: 'all', label: '全部 All' },
    { id: 'spring', label: '🌸 春意' },
    { id: 'summer', label: '✨ 盛夏' },
    { id: 'autumn', label: '🍁 金秋' },
    { id: 'winter', label: '❄️ 寒冬' },
    { id: 'ai', label: '🤖 AI 定制' },
];

/**
 * 语境长文库 (Context Reading Hub · /read)
 * 深度融合 ReadAge 的 RME-V5 记忆多目标推荐算法与 EchoStream 的双语精读：
 * 1. 顶部展示「🔥 艾宾浩斯自愈推荐首推篇」；
 * 2. 每篇文章卡片展示 RME-V5 推荐指数 (0~100) 与命中的到期复习词；
 * 3. 一键「📖 交互精读」或「🌙 屏保听读」。
 */
export default function ReadHubPage() {
    const router = useRouter();

    const [articles, setArticles] = useState<ReaderArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('all');
    const [search, setSearch] = useState('');

    // AI 生成弹窗
    const [genModalOpen, setGenModalOpen] = useState(false);
    const [genTheme, setGenTheme] = useState('');
    const [genLevel, setGenLevel] = useState<'A2' | 'B1' | 'B2' | 'C1'>('B1');
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void fetch('/api/articles')
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                if (!cancelled) setArticles(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!cancelled) setArticles([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = useMemo(() => {
        return articles.filter((a) => {
            if (category !== 'all') {
                if (category === 'ai' && a.source !== 'ai') return false;
                if (['spring', 'summer', 'autumn', 'winter'].includes(category) && a.season !== category)
                    return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase().trim();
                const matchTitle = a.title.toLowerCase().includes(q);
                const matchZh = a.titleZh?.toLowerCase().includes(q) ?? false;
                if (!matchTitle && !matchZh) return false;
            }
            return true;
        });
    }, [articles, category, search]);

    const topRecommended = useMemo(() => {
        if (articles.length === 0) return null;
        return articles[0]; // 接口已按 recommendationScore 降序排列
    }, [articles]);

    const handleCreateAiStory = async () => {
        setGenerating(true);
        try {
            const res = await fetch('/api/ambient/articles/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    theme: genTheme.trim() || undefined,
                    level: genLevel,
                }),
            });
            if (res.ok) {
                const created: ReaderArticle = await res.json();
                setArticles((prev) => [created, ...prev]);
                setGenModalOpen(false);
                setGenTheme('');
                router.push(`/read/${created.id}`);
            }
        } catch (e) {
            console.error('AI Generate failed:', e);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#08080a] text-white selection:bg-cyan-500/30">
            {/* 背景氛围渐变 */}
            <div className="pointer-events-none fixed inset-0 z-0 opacity-40">
                <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-cyan-600/15 blur-[120px]" />
                <div className="absolute right-1/4 top-1/3 h-96 w-96 rounded-full bg-violet-600/15 blur-[140px]" />
            </div>

            <div className="relative z-10 mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
                {/* 头部 */}
                <div className="flex flex-col items-start justify-between gap-6 border-b border-white/10 pb-8 md:flex-row md:items-end">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
                            <Compass size={14} />
                            <span>Context Reading Hub · 语境文库 (RME-V5)</span>
                        </div>
                        <h1
                            className="font-serif-display mt-2 text-4xl italic tracking-wide text-white sm:text-5xl"
                            style={{ fontFamily: "'Instrument Serif', serif" }}
                        >
                            Articles & Authentic Contexts
                        </h1>
                        <p className="mt-2 text-sm text-white/50" style={{ fontFamily: 'system-ui, sans-serif' }}>
                            下一篇文章，就是你的单词复习。在母语语境中沉浸精读，点击生词裂变星图，一键推入四季车窗屏保。
                        </p>
                    </div>

                    {/* 快捷操作 */}
                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            href="/home"
                            aria-label="Back to home"
                            className="liquid-glass inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-xs font-medium text-white/75 transition-all hover:border-white/35 hover:bg-white/[0.06] hover:text-white"
                        >
                            <ArrowLeft size={14} />
                            <span>Home</span>
                        </Link>
                        <Link
                            href="/ambient?mode=reading"
                            className="liquid-glass flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-xs font-medium text-white/85 transition-all hover:border-white/40 hover:bg-white/10 hover:text-white"
                        >
                            <MoonStar size={14} className="text-amber-300" />
                            <span>进入屏保听读</span>
                        </Link>

                        <button
                            type="button"
                            onClick={() => setGenModalOpen(true)}
                            className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition-all hover:bg-white/90 active:scale-95 shadow-lg shadow-white/10"
                        >
                            <Sparkles size={14} />
                            <span>✨ AI 生成专属短文</span>
                        </button>
                    </div>
                </div>

                {/* 顶置 RME-V5 自愈推荐 Banner */}
                {topRecommended && (
                    <div className="mt-8 overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-violet-950/30 to-black/60 p-6 sm:p-8 backdrop-blur-xl relative">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                                    <Flame size={15} className="text-amber-400 animate-pulse" />
                                    <span>今日记忆自愈首推 · RME-V5 算法匹配度 {topRecommended.recommendationScore ?? 92}%</span>
                                </div>
                                <h2
                                    className="font-serif-display text-2xl sm:text-3xl italic text-white"
                                    style={{ fontFamily: "'Instrument Serif', serif" }}
                                >
                                    “{topRecommended.title}”
                                </h2>
                                {topRecommended.titleZh && (
                                    <p className="text-xs sm:text-sm text-white/60">{topRecommended.titleZh}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 pt-2">
                                    <span className="text-[11px] text-white/40">推荐依据：</span>
                                    <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-[11px] text-cyan-200">
                                        {topRecommended.recommendationReason || '命中多项待强化语言点'}
                                    </span>
                                    {topRecommended.matchedDueWords && topRecommended.matchedDueWords.length > 0 && (
                                        <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[11px] text-amber-200">
                                            复习词: {topRecommended.matchedDueWords.slice(0, 4).join(', ')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                <Link
                                    href={`/read/${topRecommended.id}`}
                                    className="flex items-center gap-2 rounded-full bg-cyan-400 hover:bg-cyan-300 px-6 py-3 text-xs font-semibold text-black transition-all shadow-lg shadow-cyan-500/20"
                                >
                                    <Zap size={14} />
                                    <span>立即开始自愈精读</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                {/* 过滤与检索条 */}
                <div className="mt-8 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
                    {/* 分类胶囊 */}
                    <div className="flex flex-wrap items-center gap-2">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setCategory(cat.id)}
                                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all ${
                                    category === cat.id
                                        ? 'border-white/60 bg-white/20 text-white shadow-sm'
                                        : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/25 hover:text-white'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* 搜索框 */}
                    <div className="relative w-full sm:w-64">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="搜索文章中英文标题..."
                            className="w-full rounded-full border border-white/15 bg-black/40 py-2 pl-9 pr-4 text-xs text-white placeholder-white/30 outline-none focus:border-white/40"
                        />
                    </div>
                </div>

                {/* 文章卡片网格 */}
                <div className="mt-8">
                    {loading ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-3 text-xs text-white/40">
                            <Loader2 size={24} className="animate-spin text-cyan-400" />
                            <span>正在运行 RME-V5 多目标推荐排序…</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 p-8 text-center text-xs text-white/40">
                            <span>未找到相关文章</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setCategory('all');
                                    setSearch('');
                                }}
                                className="text-cyan-400 hover:underline"
                            >
                                清除筛选条件
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {filtered.map((art) => {
                                const levelBadge = LEVEL_COLOR[art.level] || 'bg-white/10 text-white/60';
                                return (
                                    <div
                                        key={art.id}
                                        className="liquid-glass group relative flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.05] hover:shadow-2xl"
                                    >
                                        <div>
                                            {/* 顶部标签 + RME 推荐分 */}
                                            <div className="flex items-center justify-between gap-2">
                                                <span
                                                    className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${levelBadge}`}
                                                >
                                                    {art.level}
                                                </span>
                                                {art.recommendationScore && (
                                                    <span className="flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                                                        <TrendingUp size={11} />
                                                        <span>{art.recommendationScore}分</span>
                                                    </span>
                                                )}
                                            </div>

                                            {/* 标题 */}
                                            <h3
                                                className="font-serif-display mt-4 line-clamp-1 text-2xl italic leading-snug text-white transition-colors group-hover:text-cyan-200"
                                                style={{ fontFamily: "'Instrument Serif', serif" }}
                                            >
                                                {art.title}
                                            </h3>
                                            {art.titleZh && (
                                                <p className="mt-1 line-clamp-1 text-xs text-white/45">
                                                    {art.titleZh}
                                                </p>
                                            )}

                                            {/* 推荐理由 / 语境复习词 */}
                                            <div className="mt-4 rounded-xl bg-white/[0.03] border border-white/5 p-2.5 text-[11px] text-white/65 space-y-1">
                                                <div className="flex items-center gap-1.5 text-cyan-300/80 font-medium">
                                                    <Zap size={11} />
                                                    <span>{art.recommendationReason || '语境推荐'}</span>
                                                </div>
                                                {art.matchedDueWords && art.matchedDueWords.length > 0 && (
                                                    <div className="text-[10px] text-white/40 truncate">
                                                        复习: {art.matchedDueWords.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* 底部双向分流操作栏 */}
                                        <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4">
                                            <Link
                                                href={`/read/${art.id}`}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white py-2 text-xs font-medium text-black transition-all hover:bg-white/90"
                                            >
                                                <BookOpen size={13} />
                                                <span>交互精读</span>
                                            </Link>

                                            <Link
                                                href={`/ambient?mode=reading&article=${art.id}&auto=1`}
                                                title="推送到四季车窗屏保听读"
                                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-all hover:border-white/40 hover:bg-white/15 hover:text-white"
                                            >
                                                <MoonStar size={13} />
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* AI 专属短文定制弹窗 */}
            {genModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
                    onClick={() => setGenModalOpen(false)}
                >
                    <div
                        className="liquid-glass w-full max-w-md rounded-3xl border border-white/20 bg-black/90 p-6 sm:p-7 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-cyan-400">
                                <Sparkles size={18} />
                                <h3
                                    className="font-serif-display text-2xl italic text-white"
                                    style={{ fontFamily: "'Instrument Serif', serif" }}
                                >
                                    AI Story Weaver
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setGenModalOpen(false)}
                                className="text-white/40 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="mt-1 text-xs text-white/50" style={{ fontFamily: 'system-ui, sans-serif' }}>
                            DeepSeek 将自动整合你当前遗忘临界区生词，为你创作专属 90~120 词语境故事。
                        </p>

                        <div className="mt-5 space-y-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
                            <div>
                                <label className="mb-1.5 block text-xs uppercase tracking-wider text-white/45">
                                    故事主题 / Theme
                                </label>
                                <input
                                    type="text"
                                    value={genTheme}
                                    onChange={(e) => setGenTheme(e.target.value)}
                                    placeholder="留空自动匹配，或输入如：autumn wind, old bookstore"
                                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-cyan-400"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs uppercase tracking-wider text-white/45">
                                    语言等级 / Level
                                </label>
                                <div className="flex gap-2">
                                    {(['A2', 'B1', 'B2', 'C1'] as const).map((lv) => (
                                        <button
                                            key={lv}
                                            type="button"
                                            onClick={() => setGenLevel(lv)}
                                            className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition-all ${
                                                genLevel === lv
                                                    ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200'
                                                    : 'border-white/10 bg-white/[0.02] text-white/50 hover:text-white'
                                            }`}
                                        >
                                            {lv}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleCreateAiStory}
                                disabled={generating}
                                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-xs font-semibold text-black transition-all hover:bg-white/90 disabled:opacity-50 shadow-lg shadow-white/10"
                            >
                                {generating ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>DeepSeek 正在编织语境故事…</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={14} />
                                        <span>生成并进入精读</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
