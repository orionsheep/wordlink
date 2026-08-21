'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { cacheGet, cacheSet } from '@/lib/client-cache';
import dynamic from 'next/dynamic';
import { ChineseData } from '@/lib/data';
import { ArrowLeft, Volume2, Sparkles, ChevronRight, MessageSquarePlus, StickyNote } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useAI } from '@/components/ai/AIProvider';
import { telemetry } from '@/lib/telemetry';

// Lazy load heavy markdown rendering and note components
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const WordNote = dynamic(() => import('@/components/WordNote'), {
    loading: () => <div className="text-neutral-500 text-sm py-4">Loading notes...</div>,
});

// Small plugins - import normally
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';

export default function MobileWordDetailPage() {
    const params = useParams();
    const router = useRouter();
    const word = params.word as string;
    const decodedWord = decodeURIComponent(word);

    const { aiEnabled } = useSettings();
    const { openWithWord } = useAI();

    // Synchronously read cache on init — no loading flash for cached words
    // Cache reads are deferred until after the first client render so SSR and
    // hydration always share the same loading shell.
    const [content, setContent] = useState<string | null>(null);
    const [chineseData, setChineseData] = useState<ChineseData | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showAddNote, setShowAddNote] = useState(false);
    const [myNotes, setMyNotes] = useState<{ id: string; content: string; createdAt: string }[]>([]);
    const [relatedWords, setRelatedWords] = useState<string[]>([]);
    const notesRef = useRef<HTMLDivElement>(null);

    // Fetch current user (cached)
    useEffect(() => {
        const timer = window.setTimeout(() => {
            const cached = cacheGet<{ id: string }>('auth:me');
            if (cached) {
                setCurrentUserId(cached.id);
                return;
            }
            fetch('/api/auth/me', { credentials: 'include' })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data?.id) {
                        cacheSet('auth:me', data);
                        setCurrentUserId(data.id);
                    }
                })
                .catch(() => {});
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    // Fetch word detail (cached)
    useEffect(() => {
        let disposed = false;
        let controller: AbortController | null = null;
        const cacheKey = `word:${decodedWord}`;
        const timer = window.setTimeout(() => {
            if (disposed) return;
            if (!decodedWord) {
                setContent(null);
                setChineseData(null);
                setLoading(false);
                return;
            }

            const cached = cacheGet<{ content: string; chinese?: ChineseData | null; chineseData?: ChineseData | null }>(cacheKey);
            if (cached) {
                setContent(cached.content);
                setChineseData(cached.chinese ?? cached.chineseData ?? null);
                setLoading(false);
                return;
            }

            setLoading(true);
            controller = new AbortController();
            fetch(`/api/words/${encodeURIComponent(decodedWord)}`, { signal: controller.signal })
                .then(async (res) => {
                    if (!res.ok) return null;
                    return res.json() as Promise<{ content?: string; chinese?: ChineseData | null }>;
                })
                .then((data) => {
                    if (disposed) return;
                    if (!data) {
                        setContent('# Word not found');
                        setChineseData(null);
                        return;
                    }
                    const processed = (data.content || '').replace(/\[\[(.*?)\]\]/g, (_match: string, linked: string) => `[${linked}](#${linked})`);
                    setContent(processed);
                    setChineseData(data.chinese || null);
                    cacheSet(cacheKey, { content: processed, chinese: data.chinese || null });
                })
                .catch((reason: unknown) => {
                    if (reason instanceof DOMException && reason.name === 'AbortError') return;
                    if (!disposed) setContent('# Error loading content');
                })
                .finally(() => {
                    if (!disposed) setLoading(false);
                });
        }, 0);
        return () => {
            disposed = true;
            window.clearTimeout(timer);
            controller?.abort();
        };
    }, [decodedWord]);

    // Fetch related words from fission graph (cached)
    useEffect(() => {
        let disposed = false;
        const timer = window.setTimeout(() => {
            if (!decodedWord) {
                setRelatedWords([]);
                return;
            }
            const cacheKey = `fission:${decodedWord}`;
            const cached = cacheGet<string[]>(cacheKey);
            if (cached) {
                setRelatedWords(cached);
                return;
            }
            fetch(`/api/fission?word=${encodeURIComponent(decodedWord)}`)
                .then(res => res.ok ? res.json() as Promise<{ nodes?: Array<{ level?: number; name?: string }> }> : null)
                .then(data => {
                    if (disposed || !data?.nodes) return;
                    const related = data.nodes
                        .filter((node) => node.level === 1 && typeof node.name === 'string')
                        .map((node) => node.name as string);
                    setRelatedWords(related);
                    cacheSet(cacheKey, related);
                })
                .catch(() => {});
        }, 0);
        return () => {
            disposed = true;
            window.clearTimeout(timer);
        };
    }, [decodedWord]);

    // Fetch user notes
    const fetchMyNotes = useCallback(async () => {
        if (!decodedWord || !currentUserId) return;
        try {
            const res = await fetch(`/api/notes?word=${encodeURIComponent(decodedWord)}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json() as Array<{ id: string; content: string; createdAt: string; userId?: string }>;
                setMyNotes(data.filter((note) => note.userId === currentUserId));
            }
        } catch {}
    }, [decodedWord, currentUserId]);

    useEffect(() => {
        const timer = window.setTimeout(() => { void fetchMyNotes(); }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchMyNotes]);

    // The shared tracker is the single mobile visit owner. It flushes on
    // navigation/pagehide and includes dwell/audio fields without blocking UI.
    useEffect(() => {
        if (!decodedWord) return;
        telemetry.trackEnter(decodedWord, 'mobile');
        return () => telemetry.flush();
    }, [decodedWord]);

    const playAudio = (type: 'US' | 'UK') => {
        telemetry.trackAudio();
        const audioType = type === 'US' ? 2 : 1;
        const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(decodedWord)}&type=${audioType}`;
        const speakFallback = () => {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(decodedWord);
                utterance.lang = type === 'UK' ? 'en-GB' : 'en-US';
                window.speechSynthesis.speak(utterance);
            }
        };
        try {
            const audio = new Audio(url);
            Promise.resolve(audio.play()).catch(speakFallback);
        } catch {
            speakFallback();
        }
    };

    const handleWordClick = useCallback((targetWord: string) => {
        router.push(`/word/${encodeURIComponent(targetWord)}`);
    }, [router]);

    const renderCollinsStars = (collins: string | undefined) => {
        if (!collins) return null;
        const stars = parseInt(collins);
        if (isNaN(stars) || stars <= 0) return null;
        return (
            <div className="flex items-center gap-0.5" title={`Collins: ${stars} stars`}>
                {[...Array(stars)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-500 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex flex-col">
                <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-800 animate-pulse" />
                    <div className="h-6 bg-neutral-800 rounded w-32 animate-pulse" />
                </header>
                <div className="px-4 py-4 space-y-4 animate-pulse">
                    <div className="h-4 bg-neutral-800 rounded w-1/4" />
                    <div className="h-6 bg-neutral-800 rounded w-3/4" />
                    <div className="h-px bg-neutral-800 my-4" />
                    <div className="space-y-3">
                        <div className="h-4 bg-neutral-800 rounded w-full" />
                        <div className="h-4 bg-neutral-800 rounded w-5/6" />
                        <div className="h-4 bg-neutral-800 rounded w-4/6" />
                        <div className="h-4 bg-neutral-800 rounded w-full" />
                        <div className="h-4 bg-neutral-800 rounded w-3/4" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-neutral-200 flex flex-col">
            {/* Sticky Header */}
            <header className="sticky top-0 z-30 bg-black/95 backdrop-blur-md border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
                <button
                    onClick={() => router.back()}
                    className="p-2 -ml-2 rounded-lg active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Go back"
                >
                    <ArrowLeft size={22} className="text-neutral-300" />
                </button>
                <h1 className="text-lg font-bold text-white truncate mx-3 flex-1 text-center">{decodedWord}</h1>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => playAudio('US')}
                        className="p-2 rounded-lg active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="US pronunciation"
                    >
                        <span className="text-[10px] font-bold text-blue-400 mr-0.5">US</span>
                        <Volume2 size={18} className="text-neutral-400" />
                    </button>
                    <button
                        onClick={() => playAudio('UK')}
                        className="p-2 rounded-lg active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="UK pronunciation"
                    >
                        <span className="text-[10px] font-bold text-red-400 mr-0.5">UK</span>
                        <Volume2 size={18} className="text-neutral-400" />
                    </button>
                    {aiEnabled && (
                        <button
                            onClick={() => openWithWord(decodedWord)}
                            className="p-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 active:from-purple-500 active:to-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            aria-label="Ask AI"
                        >
                            <Sparkles size={18} className="text-white" />
                        </button>
                    )}
                </div>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto pb-36">
                {/* Pronunciation & Definition */}
                {chineseData && (
                    <section className="px-4 py-4 border-b border-neutral-800/50">
                        <div className="flex items-center gap-3 text-neutral-400 font-mono text-sm mb-2">
                            <span>/{chineseData.phonetic || chineseData.pronunciation}/</span>
                            {renderCollinsStars(chineseData.collins)}
                        </div>
                        <p className="text-lg text-neutral-200 font-medium leading-relaxed">
                            {chineseData.concise_definition}
                        </p>
                    </section>
                )}

                {/* Quick Note Actions */}
                {currentUserId && (
                    <section className="px-4 py-3 border-b border-neutral-800/50 flex gap-2">
                        <button
                            onClick={() => setShowAddNote(!showAddNote)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                                showAddNote ? 'bg-blue-600 text-white' : 'bg-neutral-900 border border-neutral-800 text-neutral-400'
                            }`}
                        >
                            <MessageSquarePlus size={14} />
                            <span>{showAddNote ? '收起' : '添加笔记'}</span>
                        </button>
                    </section>
                )}

                {/* Inline Add Note */}
                {showAddNote && currentUserId && (
                    <section className="px-4 py-3 bg-neutral-900/50 border-b border-neutral-800/50">
                        <WordNote word={decodedWord} currentUserId={currentUserId} compact={true} />
                    </section>
                )}

                {/* My Notes */}
                {myNotes.length > 0 && (
                    <section className="px-4 py-3 border-b border-neutral-800/50">
                        <div className="flex items-center gap-2 text-xs text-blue-400 font-medium mb-2">
                            <StickyNote size={12} />
                            <span>我的笔记</span>
                        </div>
                        {myNotes.map((note) => (
                            <div key={note.id} className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg mb-2">
                                <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                                <p className="text-xs text-neutral-600 mt-2">{new Date(note.createdAt).toLocaleDateString('zh-CN')}</p>
                            </div>
                        ))}
                    </section>
                )}

                {/* Markdown Content */}
                {content && (
                    <section className="px-4 py-4">
                        <div className="prose prose-invert max-w-none prose-headings:font-light prose-a:text-blue-400 prose-a:no-underline prose-p:leading-relaxed prose-strong:text-yellow-200 prose-strong:font-bold prose-em:text-neutral-300 prose-sm">
                            <ReactMarkdown
                                remarkPlugins={[remarkBreaks]}
                                rehypePlugins={[rehypeRaw]}
                                components={{
                                    a: ({ href, children, ...props }) => {
                                        if (href?.startsWith('#')) {
                                            return (
                                                <button
                                                    onClick={() => handleWordClick(href.substring(1))}
                                                    className="cursor-pointer text-blue-400 active:text-blue-300 transition-colors underline"
                                                >
                                                    {children}
                                                </button>
                                            );
                                        }
                                        return <a {...props} href={href} className="text-blue-400">{children}</a>;
                                    },
                                    small: ({ ...props }) => (
                                        <span {...props} className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold ml-1 mr-1" />
                                    ),
                                    p: ({ ...props }) => (
                                        <div {...props} className="mb-2 text-neutral-300 leading-7" />
                                    )
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        </div>
                    </section>
                )}

                {/* Word Forms */}
                {chineseData?.forms && Object.keys(chineseData.forms).length > 0 && (
                    <section className="px-4 py-4 border-t border-neutral-800">
                        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                            <span className="w-1 h-5 bg-green-500 rounded-full"></span>
                            Word Forms
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(chineseData.forms).map(([key, value]) => (
                                <div key={key} className="flex items-center bg-neutral-900/50 border border-neutral-800 rounded-md px-3 py-2">
                                    <span className="text-neutral-500 text-xs uppercase font-bold tracking-wider mr-2">{key}</span>
                                    <span className="text-neutral-200 font-medium text-sm">{value}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Detailed Definitions */}
                {chineseData?.definitions && chineseData.definitions.length > 0 && (
                    <section className="px-4 py-4 border-t border-neutral-800">
                        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                            <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
                            Detailed Definitions
                        </h3>
                        <div className="space-y-3">
                            {chineseData.definitions.map((def, idx) => (
                                <div key={idx} className="bg-neutral-900/30 rounded-lg p-3 border border-neutral-800/50">
                                    <span className="inline-block px-2 py-0.5 bg-neutral-800 text-neutral-400 text-xs rounded uppercase font-bold tracking-wider mb-2">
                                        {def.pos}
                                    </span>
                                    <p className="text-neutral-200 text-sm mb-1">{def.explanation_en}</p>
                                    <p className="text-neutral-500 text-xs mb-2">{def.explanation_cn}</p>
                                    <div className="pl-3 border-l-2 border-neutral-700">
                                        <p className="text-neutral-300 italic text-sm mb-1">&quot;{def.example_en}&quot;</p>
                                        <p className="text-neutral-500 text-xs">{def.example_cn}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Comparisons */}
                {chineseData?.comparison && chineseData.comparison.length > 0 && (
                    <section className="px-4 py-4 border-t border-neutral-800">
                        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                            <span className="w-1 h-5 bg-purple-500 rounded-full"></span>
                            Comparisons
                        </h3>
                        <div className="space-y-3">
                            {chineseData.comparison.map((comp, idx) => (
                                <div key={idx} className="bg-neutral-900/30 rounded-lg p-3 border border-neutral-800/50">
                                    <div className="flex items-baseline gap-2 mb-2">
                                        <span className="text-purple-400 font-bold">{comp.word_to_compare}</span>
                                        <span className="text-neutral-500 text-xs">vs {decodedWord}</span>
                                    </div>
                                    <p className="text-neutral-300 leading-relaxed text-sm">{comp.analysis}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Related Words */}
                {relatedWords.length > 0 && (
                    <section className="px-4 py-4 border-t border-neutral-800">
                        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                            <span className="w-1 h-5 bg-cyan-500 rounded-full"></span>
                            Related Words
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {relatedWords.map((rw) => (
                                <button
                                    key={rw}
                                    onClick={() => handleWordClick(rw)}
                                    className="px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-blue-400 active:bg-neutral-800 transition-colors flex items-center gap-1"
                                >
                                    {rw}
                                    <ChevronRight size={14} className="text-neutral-600" />
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Word Notes Section */}
                <section ref={notesRef} className="px-4 py-4 border-t border-neutral-800">
                    <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                        <span className="w-1 h-5 bg-orange-500 rounded-full"></span>
                        单词笔记
                    </h3>
                    {currentUserId ? (
                        <WordNote word={decodedWord} currentUserId={currentUserId} />
                    ) : (
                        <div className="text-center py-6 text-neutral-500 text-sm">请登录后查看和添加笔记</div>
                    )}
                </section>
            </main>

            {/* Bottom Action Bar - View Graph */}
            <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-md border-t border-neutral-800 px-4 py-3 safe-area-bottom">
                <button
                    onClick={() => router.push(`/graph/${encodeURIComponent(decodedWord)}`)}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 active:from-blue-500 active:to-purple-500 text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <circle cx="4" cy="6" r="2" />
                        <circle cx="20" cy="6" r="2" />
                        <circle cx="4" cy="18" r="2" />
                        <circle cx="20" cy="18" r="2" />
                        <line x1="9.5" y1="10.5" x2="5.5" y2="7.5" />
                        <line x1="14.5" y1="10.5" x2="18.5" y2="7.5" />
                        <line x1="9.5" y1="13.5" x2="5.5" y2="16.5" />
                        <line x1="14.5" y1="13.5" x2="18.5" y2="16.5" />
                    </svg>
                    查看单词图谱
                </button>
            </div>
        </div>
    );
}
