'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BookOpen,
    Check,
    CheckSquare,
    Compass,
    Loader2,
    Search,
    Sparkles,
    Square,
    X,
} from 'lucide-react';
import { FALLBACK_WORD_POOL } from './wordPool';
import type { AmbientWordCard } from './wordPool';

/** Ambient 播放列表配置 */
export interface AmbientConfig {
    /** 词库路径（如 '考试考纲/3-CET4-乱序.csv' 或 'user:xxx'），空串 = 使用内置精选词池 */
    path: string;
    pathName: string;
    /** 分组索引（-1 为全库，0 开始为第 N 组） */
    groupIndex: number;
    /** 每组词数 */
    groupSize: number;
    /** 随机打乱词序 */
    shuffle: boolean;
    /** 每词停留时长 ms */
    durationMs: number;
    /** 自定义选中的单词列表（若为空或 undefined 则默认播放全部） */
    customWordList?: string[];
}

export const DEFAULT_AMBIENT_CONFIG: AmbientConfig = {
    path: '',
    pathName: '✨ 精选意境词池 (32 词)',
    groupIndex: 0,
    groupSize: 40,
    shuffle: true,
    durationMs: 12000,
};

const DURATION_OPTIONS = [
    { label: '舒缓 · 8s', value: 8000 },
    { label: '从容 · 12s', value: 12000 },
    { label: '沉浸 · 16s', value: 16000 },
];

const SIZE_OPTIONS = [20, 30, 50, 100];

interface LibraryItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    source?: 'system' | 'user';
    wordCount?: number;
}

interface GroupItem {
    index: number;
    start: number;
    end: number;
    label: string;
}

/**
 * 播放列表与选词中心（高阶 Liquid Glass 工作台）。
 * 左右双栏：左侧多源词库 & 分组控制，右侧词单实时明细、勾选与检索。
 */
export default function AmbientSettings({
    cfg,
    onApply,
    onClose,
}: {
    cfg: AmbientConfig;
    onApply: (next: AmbientConfig) => void;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<AmbientConfig>(cfg);
    const [activeTab, setActiveTab] = useState<'library' | 'words' | 'options'>('library');

    // 词库数据源
    const [flatLibs, setFlatLibs] = useState<LibraryItem[]>([]);
    const [loadingLibs, setLoadingLibs] = useState(true);

    // 当前词库的分组数据
    const [groups, setGroups] = useState<GroupItem[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    // 当前分组的单词明细列表（用于右侧预览与勾选）
    const [previewWords, setPreviewWords] = useState<AmbientWordCard[]>([]);
    const [loadingWords, setLoadingWords] = useState(false);
    const [selectedWords, setSelectedWords] = useState<Set<string>>(
        new Set(draft.customWordList || []),
    );
    const [searchQuery, setSearchQuery] = useState('');

    // 递归拉取所有可用的词库文件（拍平目录）
    useEffect(() => {
        let cancelled = false;
        async function fetchLibraries() {
            setLoadingLibs(true);
            try {
                // 1. 尝试 flat 接口
                const res = await fetch('/api/libraries?flat=true');
                if (res.ok) {
                    const data: LibraryItem[] = await res.json();
                    if (!cancelled && Array.isArray(data) && data.length > 0) {
                        // 过滤掉目录，只要可播放的文件或 user 词库
                        const files = data.filter((item) => item.type === 'file' || item.source === 'user' || item.path.endsWith('.csv'));
                        if (files.length > 0) {
                            setFlatLibs(files);
                            setLoadingLibs(false);
                            return;
                        }
                    }
                }

                // 2. 如果 flat 为空，手动扫描常见二级目录
                const rootRes = await fetch('/api/libraries');
                const rootItems: LibraryItem[] = rootRes.ok ? await rootRes.json() : [];
                const files: LibraryItem[] = [];

                for (const item of rootItems) {
                    if (item.type === 'file' || item.source === 'user') {
                        files.push(item);
                    } else if (item.type === 'directory') {
                        const subRes = await fetch(`/api/libraries?path=${encodeURIComponent(item.path)}`);
                        if (subRes.ok) {
                            const subItems: LibraryItem[] = await subRes.json();
                            files.push(...subItems.filter((s) => s.type === 'file'));
                        }
                    }
                }

                if (!cancelled) {
                    setFlatLibs(files);
                }
            } catch (err) {
                console.error('Failed to fetch libraries:', err);
            } finally {
                if (!cancelled) setLoadingLibs(false);
            }
        }

        fetchLibraries();
        return () => {
            cancelled = true;
        };
    }, []);

    // 词库 / groupSize 变化时，拉取分组
    useEffect(() => {
        if (!draft.path) {
            setGroups([]);
            return;
        }
        let cancelled = false;
        setLoadingGroups(true);
        void fetch(
            `/api/library-groups?path=${encodeURIComponent(draft.path)}&groupSize=${draft.groupSize}`,
        )
            .then((r) => (r.ok ? r.json() : []))
            .then((data: GroupItem[]) => {
                if (!cancelled) {
                    // 过滤掉 -1 (全库) 选项，保证分组清晰
                    const filtered = Array.isArray(data)
                        ? data.filter((g) => g.index !== -1)
                        : [];
                    setGroups(filtered);
                }
            })
            .catch(() => {
                if (!cancelled) setGroups([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingGroups(false);
            });

        return () => {
            cancelled = true;
        };
    }, [draft.path, draft.groupSize]);

    // 选定词库 / 分组后，拉取该组的具体单词以供预览与勾选
    const fetchWordsForPreview = useCallback(async (path: string, groupIdx: number, groupSize: number) => {
        setLoadingWords(true);
        try {
            if (!path) {
                // 内置精选词池
                setPreviewWords(FALLBACK_WORD_POOL);
                return;
            }
            const res = await fetch(
                `/api/library-words?path=${encodeURIComponent(path)}&groupIndex=${groupIdx}&groupSize=${groupSize}&includeDefinitions=true`,
            );
            if (res.ok) {
                const data: unknown = await res.json();
                if (Array.isArray(data)) {
                    const cards: AmbientWordCard[] = (
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
                    setPreviewWords(cards);
                    return;
                }
            }
            setPreviewWords(FALLBACK_WORD_POOL);
        } catch {
            setPreviewWords(FALLBACK_WORD_POOL);
        } finally {
            setLoadingWords(false);
        }
    }, []);

    useEffect(() => {
        fetchWordsForPreview(draft.path, draft.groupIndex, draft.groupSize);
    }, [draft.path, draft.groupIndex, draft.groupSize, fetchWordsForPreview]);

    // 默认全选当前加载出的单词
    useEffect(() => {
        if (previewWords.length > 0 && selectedWords.size === 0) {
            setSelectedWords(new Set(previewWords.map((w) => w.word)));
        }
    }, [previewWords, selectedWords.size]);

    // 单词勾选切换
    const toggleWord = (word: string) => {
        setSelectedWords((prev) => {
            const next = new Set(prev);
            if (next.has(word)) next.delete(word);
            else next.add(word);
            return next;
        });
    };

    const selectAllWords = () => {
        setSelectedWords(new Set(previewWords.map((w) => w.word)));
    };

    const clearAllWords = () => {
        setSelectedWords(new Set());
    };

    // 搜索过滤后的预览列表
    const filteredPreviewWords = useMemo(() => {
        if (!searchQuery.trim()) return previewWords;
        const q = searchQuery.toLowerCase().trim();
        return previewWords.filter(
            (w) =>
                w.word.toLowerCase().includes(q) ||
                (w.definition && w.definition.toLowerCase().includes(q)),
        );
    }, [previewWords, searchQuery]);

    // 应用配置
    const handleApply = () => {
        const customList =
            selectedWords.size > 0 && selectedWords.size < previewWords.length
                ? Array.from(selectedWords)
                : undefined;

        onApply({
            ...draft,
            customWordList: customList,
        });
    };

    // 友好展示词库名称
    const formatLibTitle = (name: string) => {
        return name
            .replace(/^考试考纲\//, '')
            .replace(/\.csv$/, '')
            .replace(/^1-/, '初中 ')
            .replace(/^2-/, '高中 ')
            .replace(/^3-/, '四级 ')
            .replace(/^4-/, '六级 ')
            .replace(/^5-/, '考研 ')
            .replace(/^6-/, '托福 ')
            .replace(/^7-/, 'SAT ');
    };

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-3 sm:p-6 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="liquid-glass flex h-[min(92vh,700px)] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/15 bg-black/40 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ===== 头部：标题与关闭 ===== */}
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8 sm:py-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-inner">
                            <Compass size={18} />
                        </div>
                        <div>
                            <h2
                                className="font-serif-display text-2xl italic tracking-wide text-white sm:text-3xl"
                                style={{ fontFamily: "'Instrument Serif', serif" }}
                            >
                                Playlist & Vocabulary Hub
                            </h2>
                            <p className="text-[11px] text-white/50" style={{ fontFamily: 'system-ui, sans-serif' }}>
                                自定义屏保词库、分段轮播与高频生词勾选
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭设置"
                        className="ambient-ctl flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ===== 移动端 Tab 导航条 ===== */}
                <div className="flex border-b border-white/10 px-6 sm:hidden">
                    {[
                        { id: 'library', label: '1. 词库与分组' },
                        { id: 'words', label: `2. 选词明细 (${selectedWords.size})` },
                        { id: 'options', label: '3. 节奏偏好' },
                    ].map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveTab(t.id as 'library' | 'words' | 'options')}
                            className={`flex-1 py-3 text-xs font-medium transition-colors ${
                                activeTab === t.id
                                    ? 'border-b-2 border-white text-white'
                                    : 'text-white/45 hover:text-white/80'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ===== 双栏主体内容区 ===== */}
                <div
                    className="flex flex-1 overflow-hidden"
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                >
                    {/* ──── 左栏：词库大纲、分组与偏好 ──── */}
                    <div
                        className={`w-full flex-col overflow-y-auto border-r border-white/10 p-5 sm:flex sm:w-[340px] md:w-[380px] ${
                            activeTab === 'library' || activeTab === 'options' ? 'flex' : 'hidden sm:flex'
                        }`}
                    >
                        <div className="space-y-6">
                            {/* 1. 词库大纲选择 */}
                            <div>
                                <label className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/50">
                                    <span>选择词库 / Library</span>
                                    {loadingLibs && <Loader2 size={12} className="animate-spin text-white/40" />}
                                </label>

                                <div className="space-y-2">
                                    {/* 内置精选意境词池 */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraft((d) => ({
                                                ...d,
                                                path: '',
                                                pathName: '✨ 精选意境词池 (32 词)',
                                                groupIndex: 0,
                                            }));
                                            setSelectedWords(new Set());
                                        }}
                                        className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                                            draft.path === ''
                                                ? 'border-white/60 bg-white/20 text-white shadow-lg'
                                                : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/30 hover:bg-white/[0.08]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Sparkles size={16} className="text-amber-300" />
                                            <div>
                                                <div className="text-sm font-medium">✨ 精选高雅意境词</div>
                                                <div className="text-[11px] text-white/40">32 粒发音清澈、充满哲思与诗意的词汇</div>
                                            </div>
                                        </div>
                                        {draft.path === '' && <Check size={16} className="text-white" />}
                                    </button>

                                    {/* 考试考纲系统词库列表 */}
                                    <div className="max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                                        {flatLibs.map((lib) => {
                                            const isSelected = draft.path === lib.path;
                                            return (
                                                <button
                                                    key={lib.path}
                                                    type="button"
                                                    onClick={() => {
                                                        setDraft((d) => ({
                                                            ...d,
                                                            path: lib.path,
                                                            pathName: formatLibTitle(lib.name),
                                                            groupIndex: 0,
                                                        }));
                                                        setSelectedWords(new Set());
                                                    }}
                                                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition-all ${
                                                        isSelected
                                                            ? 'border-white/60 bg-white/20 text-white shadow'
                                                            : 'border-white/10 bg-white/[0.02] text-white/65 hover:border-white/25 hover:bg-white/[0.06] hover:text-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <BookOpen size={13} className="shrink-0 text-white/40" />
                                                        <span className="truncate font-medium">{formatLibTitle(lib.name)}</span>
                                                    </div>
                                                    {isSelected && <Check size={14} className="shrink-0 text-white" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* 2. 分组选择器（仅非精选词库时显示） */}
                            {draft.path && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
                                            选择分组 / Group
                                        </label>
                                        <div className="flex items-center gap-1">
                                            {SIZE_OPTIONS.map((size) => (
                                                <button
                                                    key={size}
                                                    type="button"
                                                    onClick={() =>
                                                        setDraft((d) => ({ ...d, groupSize: size, groupIndex: 0 }))
                                                    }
                                                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all ${
                                                        draft.groupSize === size
                                                            ? 'bg-white text-black'
                                                            : 'bg-white/10 text-white/50 hover:bg-white/20'
                                                    }`}
                                                >
                                                    {size}词/组
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {loadingGroups ? (
                                        <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 text-xs text-white/40">
                                            <Loader2 size={13} className="animate-spin" /> 计算分组切片…
                                        </div>
                                    ) : groups.length === 0 ? (
                                        <div className="rounded-xl border border-white/10 p-3 text-center text-xs text-white/40">
                                            暂无分组，默认全选
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                            {groups.map((g) => {
                                                const isSel = draft.groupIndex === g.index;
                                                return (
                                                    <button
                                                        key={g.index}
                                                        type="button"
                                                        onClick={() => {
                                                            setDraft((d) => ({ ...d, groupIndex: g.index }));
                                                            setSelectedWords(new Set());
                                                        }}
                                                        className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition-all ${
                                                            isSel
                                                                ? 'border-white/60 bg-white/20 font-medium text-white'
                                                                : 'border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:text-white'
                                                        }`}
                                                    >
                                                        <span className="truncate">{g.label.replace('Group ', '第 ')}</span>
                                                        {isSel && <Check size={12} className="text-white" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 3. 播放偏好设置 */}
                            <div className="border-t border-white/10 pt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-xs font-semibold text-white/80">随机乱序播放</span>
                                        <p className="text-[10px] text-white/40">Shuffle 随机抽取不重复词流</p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={draft.shuffle}
                                        onClick={() => setDraft((d) => ({ ...d, shuffle: !d.shuffle }))}
                                        className={`relative h-6 w-11 rounded-full transition-colors duration-300 ${
                                            draft.shuffle ? 'bg-white' : 'bg-white/20'
                                        }`}
                                    >
                                        <span
                                            className={`absolute top-0.5 h-5 w-5 rounded-full transition-all duration-300 ${
                                                draft.shuffle ? 'left-[22px] bg-black' : 'left-0.5 bg-white'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div>
                                    <span className="text-xs font-semibold text-white/80">每词驻留节奏</span>
                                    <div className="mt-1.5 flex gap-1.5">
                                        {DURATION_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setDraft((d) => ({ ...d, durationMs: opt.value }))}
                                                className={`flex-1 rounded-xl border py-1.5 text-center text-xs transition-all ${
                                                    draft.durationMs === opt.value
                                                        ? 'border-white/60 bg-white/20 font-medium text-white'
                                                        : 'border-white/10 bg-white/[0.02] text-white/50 hover:text-white'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ──── 右栏：单词明细列表、检索与勾选 ──── */}
                    <div
                        className={`flex-1 flex-col overflow-hidden bg-white/[0.01] ${
                            activeTab === 'words' ? 'flex' : 'hidden sm:flex'
                        }`}
                    >
                        {/* 搜索与全选工具条 */}
                        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 gap-3">
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                                <input
                                    type="text"
                                    placeholder="搜索单词或中文释义..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-black/40 py-1.5 pl-9 pr-4 text-xs text-white placeholder-white/30 outline-none focus:border-white/30"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={selectAllWords}
                                    className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] text-white/70 hover:bg-white/20 hover:text-white"
                                >
                                    全选
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAllWords}
                                    className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-white/40 hover:bg-white/15 hover:text-white/70"
                                >
                                    清空
                                </button>
                            </div>
                        </div>

                        {/* 单词列表容器 */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {loadingWords ? (
                                <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-white/40">
                                    <Loader2 size={20} className="animate-spin text-white/50" />
                                    <span>正在加载词卡明细与音标...</span>
                                </div>
                            ) : filteredPreviewWords.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center text-xs text-white/40">
                                    <span>未找到匹配单词</span>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                    {filteredPreviewWords.map((card, idx) => {
                                        const isChecked = selectedWords.has(card.word);
                                        return (
                                            <div
                                                key={`${card.word}-${idx}`}
                                                onClick={() => toggleWord(card.word)}
                                                className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
                                                    isChecked
                                                        ? 'border-white/30 bg-white/[0.08] text-white shadow-sm'
                                                        : 'border-white/5 bg-transparent text-white/35 hover:border-white/20 hover:bg-white/[0.03]'
                                                }`}
                                            >
                                                <div className="mt-0.5">
                                                    {isChecked ? (
                                                        <CheckSquare size={16} className="text-white" />
                                                    ) : (
                                                        <Square size={16} className="text-white/30" />
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-baseline gap-2">
                                                        <span
                                                            className={`font-serif-display text-base italic leading-none ${
                                                                isChecked ? 'text-white' : 'text-white/50'
                                                            }`}
                                                            style={{ fontFamily: "'Instrument Serif', serif" }}
                                                        >
                                                            {card.word}
                                                        </span>
                                                        {card.phonetic && (
                                                            <span className="text-[11px] text-white/40">
                                                                {card.phonetic}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {card.definition && (
                                                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/70">
                                                            {card.definition}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== 底部操作栏 ===== */}
                <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-6 py-4 sm:px-8">
                    <div className="text-xs text-white/60" style={{ fontFamily: 'system-ui, sans-serif' }}>
                        当前选定：<span className="font-semibold text-white">{selectedWords.size}</span> / {previewWords.length} 词
                        <span className="hidden sm:inline text-white/30"> · </span>
                        <span className="hidden sm:inline text-white/40">
                            预计播放约 {Math.ceil((selectedWords.size * draft.durationMs) / 60000)} 分钟
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full px-5 py-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            disabled={selectedWords.size === 0}
                            className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-xs font-medium text-black transition-all hover:bg-white/90 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <Sparkles size={14} />
                            <span>应用并开始沉浸</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
