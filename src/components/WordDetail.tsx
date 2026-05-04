import { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';
import { ChineseData } from '@/lib/data';
import WordNote from './WordNote';
import { MessageSquarePlus, ArrowDown, StickyNote, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useSettings } from '@/context/SettingsContext';
import { useAI } from './ai/AIProvider';
import WordTooltip from './WordTooltip';

interface WordDetailProps {
    word: string | null;
    onWordClick?: (word: string) => void;
    onNextWord?: () => void;
    onPrevWord?: () => void;
    transparent?: boolean;
    currentUserId?: string;
}

export default function WordDetail(props: WordDetailProps) {
    const { word, onWordClick, currentUserId, onPrevWord, onNextWord, transparent } = props;
    const { shortcuts, showHoverTooltip, showWordDetailTooltip, aiEnabled } = useSettings();
    const { openWithWord } = useAI();
    const t = useTranslations();
    const [content, setContent] = useState<string | null>(null);
    const [chineseData, setChineseData] = useState<ChineseData | null>(null);
    const [loading, setLoading] = useState(false);
    const [showAddNote, setShowAddNote] = useState(false);
    const [myNotes, setMyNotes] = useState<{ id: string; content: string; createdAt: string }[]>([]);
    const notesRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch user's own notes for this word
    const fetchMyNotes = useCallback(async () => {
        if (!word || !currentUserId) return;
        try {
            const res = await fetch(`/api/notes?word=${encodeURIComponent(word)}`, {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                // Filter only current user's notes
                const userNotes = data.filter((note: any) => note.userId === currentUserId);
                setMyNotes(userNotes);
            }
        } catch (error) {
            console.error('Failed to fetch my notes:', error);
        }
    }, [word, currentUserId]);

    useEffect(() => {
        fetchMyNotes();
    }, [fetchMyNotes]);

    useEffect(() => {
        if (!word) {
            setContent(null);
            setChineseData(null);
            return;
        }

        const fetchDetail = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/words/${word}`);
                if (res.ok) {
                    const data = await res.json();

                    // Handle Markdown Content
                    let processed = data.content || '';
                    processed = processed.replace(/\[\[(.*?)\]\]/g, (match: string, p1: string) => {
                        return `[${p1}](#${p1})`;
                    });
                    setContent(processed);

                    // Handle Chinese Data
                    setChineseData(data.chinese || null);
                } else {
                    setContent(`# ${t('wordDetail.wordNotFound')}`);
                    setChineseData(null);
                }
            } catch (error) {
                console.error('Failed to fetch detail', error);
                setContent(`# ${t('wordDetail.errorLoading')}`);
            } finally {
                setLoading(false);
            }
        };

        fetchDetail();
    }, [word]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const key = e.key.toLowerCase();

            if (key === shortcuts.audio_uk.toLowerCase()) {
                e.preventDefault();
                playAudio('UK');
            } else if (key === shortcuts.audio_us.toLowerCase()) {
                e.preventDefault();
                playAudio('US');
            } else if (key === shortcuts.nav_prev.toLowerCase()) {
                e.preventDefault();
                if (onPrevWord) onPrevWord();
            } else if (key === shortcuts.nav_next.toLowerCase()) {
                e.preventDefault();
                if (onNextWord) onNextWord();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [word, onNextWord, onPrevWord, shortcuts]);

    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        const href = e.currentTarget.getAttribute('href');
        if (href && href.startsWith('#')) {
            e.preventDefault();
            const targetWord = href.substring(1);
            if (onWordClick) {
                onWordClick(targetWord);
            }
        }
    };

    const scrollToNotes = () => {
        notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const playAudio = (type: 'US' | 'UK') => {
        if (!word) return;
        // Use Youdao API instead of browser TTS
        // Youdao API: 1 = UK, 2 = US
        const audioType = type === 'US' ? 2 : 1;
        const primaryUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${audioType}`;

        const audio = new Audio();

        // Event listener for when audio can play
        audio.addEventListener('canplaythrough', () => {
            audio.play().catch(err => console.error('Audio playback failed:', err));
        });

        // Error handler with fallback
        audio.addEventListener('error', () => {
            console.warn('Primary audio source failed, trying fallback...');
            // Fallback to another pronunciation API
            const fallbackUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${word.toLowerCase()}--_${type.toLowerCase()}_1.mp3`;
            const fallbackAudio = new Audio(fallbackUrl);
            fallbackAudio.play().catch(err => {
                console.error('Fallback audio also failed:', err);
                // Last resort: browser TTS
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(word);
                    utterance.lang = type === 'UK' ? 'en-GB' : 'en-US';
                    window.speechSynthesis.speak(utterance);
                }
            });
        });

        audio.src = primaryUrl;
        audio.load();
    };

    const renderCollinsStars = (collins: string | undefined) => {
        if (!collins) return null;
        const stars = parseInt(collins);
        if (isNaN(stars) || stars <= 0) return null;

        return (
            <div className="flex items-center gap-0.5 ml-2" title={`${t('wordDetail.collinsStars')}: ${stars}`}>
                {[...Array(stars)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-500 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                ))}
            </div>
        );
    };

    if (!word) {
        return (
            <div className="h-full flex items-center justify-center text-neutral-500 font-light tracking-wider">
                {t('wordDetail.selectWord').toUpperCase()}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center text-neutral-500">
                {t('wordDetail.loading')}
            </div>
        );
    }

    return (
        <div ref={containerRef} className={`h-full flex flex-col ${transparent ? 'bg-transparent' : 'bg-black'} text-neutral-200 relative`}>
            {/* Header with Word Title */}
            <div className="p-8 pb-4 border-b border-neutral-900">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-bold text-white tracking-tight">{word}</h1>
                        {word && aiEnabled && (
                            <button
                                onClick={() => openWithWord(word)}
                                className="px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-medium flex items-center gap-1.5 transition-all hover:scale-105 shadow-lg shadow-purple-900/30"
                                title="Ask AI about this word"
                            >
                                <Sparkles size={14} />
                                <span>{t('wordDetail.askAI')}</span>
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => playAudio('US')}
                            className="p-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-blue-400 transition-colors"
                            title={`${t('wordDetail.usPronunciation')} (${shortcuts.audio_us.toUpperCase()})`}
                        >
                            <span className="text-xs font-bold mr-1">US</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                            </svg>
                        </button>
                        <button
                            onClick={() => playAudio('UK')}
                            className="p-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-red-400 transition-colors"
                            title={`${t('wordDetail.ukPronunciation')} (${shortcuts.audio_uk.toUpperCase()})`}
                        >
                            <span className="text-xs font-bold mr-1">UK</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Pronunciation & Concise Definition with Note Buttons */}
                {chineseData && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 text-neutral-400 font-mono text-sm">
                            <span>/{chineseData.phonetic || chineseData.pronunciation}/</span>
                            {renderCollinsStars(chineseData.collins)}
                        </div>
                        <div className="flex items-start gap-2">
                            <div className="flex-1 text-lg text-neutral-300 font-medium">
                                {chineseData.concise_definition}
                            </div>
                            {/* Note Buttons - On the right side of Chinese definition */}
                            {currentUserId && (
                                <div className="flex gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => setShowAddNote(!showAddNote)}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all whitespace-nowrap ${showAddNote
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                                            }`}
                                        title={t('wordDetail.quickAddNote')}
                                    >
                                        <MessageSquarePlus size={12} />
                                        <span>{showAddNote ? t('wordDetail.collapse') : t('wordDetail.addNote')}</span>
                                    </button>
                                    <button
                                        onClick={scrollToNotes}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 text-xs transition-all whitespace-nowrap"
                                        title={t('wordDetail.jumpToNotes')}
                                    >
                                        <ArrowDown size={12} />
                                        <span>{t('wordDetail.viewNotes')}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Inline Add Note Section if toggled */}
                {showAddNote && currentUserId && (
                    <div className="mt-3 p-3 bg-neutral-900 border border-neutral-800 rounded-lg">
                        <h4 className="text-xs font-semibold text-neutral-300 mb-2">{t('wordDetail.quickAddNote')}</h4>
                        <WordNote word={word} currentUserId={currentUserId} compact={true} />
                    </div>
                )}

                {/* My Notes - Display user's own notes prominently */}
                {myNotes.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
                            <StickyNote size={12} />
                            <span>{t('wordDetail.myNotes')}</span>
                        </div>
                        {myNotes.map((note) => (
                            <div
                                key={note.id}
                                className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg"
                            >
                                <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                                    {note.content}
                                </p>
                                <p className="text-xs text-neutral-600 mt-2">
                                    {new Date(note.createdAt).toLocaleDateString('zh-CN')}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-8 pt-6 space-y-8">
                {/* Markdown Content (Original) */}
                {content && (
                    <div className="prose prose-invert max-w-none prose-headings:font-light prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-p:leading-relaxed prose-strong:text-yellow-200 prose-strong:font-bold prose-em:text-neutral-300">
                        <ReactMarkdown
                            remarkPlugins={[remarkBreaks]}
                            rehypePlugins={[rehypeRaw]}
                            components={{
                                a: ({ node, ...props }) => (
                                    <WordLink
                                        {...props}
                                        onClick={handleLinkClick}
                                        showTooltip={showHoverTooltip && showWordDetailTooltip}
                                    />
                                ),
                                small: ({ node, ...props }) => (
                                    <span {...props} className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold ml-1 mr-1" />
                                ),
                                p: ({ node, ...props }) => (
                                    <div {...props} className="mb-2 text-neutral-300 leading-7" />
                                )
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                )}

                {/* Word Forms */}
                {chineseData && chineseData.forms && Object.keys(chineseData.forms).length > 0 && (
                    <div className="border-t border-neutral-800 pt-6">
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <span className="w-1 h-6 bg-green-500 rounded-full"></span>
                            {t('wordDetail.wordForms')}
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(chineseData.forms).map(([key, value]) => (
                                <div key={key} className="flex items-center bg-neutral-900/50 border border-neutral-800 rounded-md px-3 py-2">
                                    <span className="text-neutral-500 text-xs uppercase font-bold tracking-wider mr-2">{key}</span>
                                    <span className="text-neutral-200 font-medium">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Detailed Definitions */}
                {chineseData && chineseData.definitions && chineseData.definitions.length > 0 && (
                    <div className="border-t border-neutral-800 pt-6">
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                            {t('wordDetail.detailedDefinitions')}
                        </h3>
                        <div className="space-y-6">
                            {chineseData.definitions.map((def, idx) => (
                                <div key={idx} className="bg-neutral-900/30 rounded-lg p-4 border border-neutral-800/50">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-0.5 bg-neutral-800 text-neutral-400 text-xs rounded uppercase font-bold tracking-wider">
                                            {def.pos}
                                        </span>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-neutral-200 mb-1">{def.explanation_en}</p>
                                            <p className="text-neutral-500 text-sm">{def.explanation_cn}</p>
                                        </div>
                                        <div className="pl-3 border-l-2 border-neutral-700">
                                            <p className="text-neutral-300 italic mb-1">"{def.example_en}"</p>
                                            <p className="text-neutral-500 text-sm">{def.example_cn}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Comparisons */}
                {chineseData && chineseData.comparison && chineseData.comparison.length > 0 && (
                    <div className="border-t border-neutral-800 pt-6 pb-8">
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                            {t('wordDetail.comparisons')}
                        </h3>
                        <div className="grid gap-4">
                            {chineseData.comparison.map((comp, idx) => (
                                <div key={idx} className="bg-neutral-900/30 rounded-lg p-4 border border-neutral-800/50">
                                    <div className="flex items-baseline gap-2 mb-2">
                                        <span className="text-purple-400 font-bold text-lg">{comp.word_to_compare}</span>
                                        <span className="text-neutral-500 text-sm">vs {word}</span>
                                    </div>
                                    <p className="text-neutral-300 leading-relaxed text-sm">
                                        {comp.analysis}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Word Notes Section */}
                <div ref={notesRef} className="border-t border-neutral-800 pt-6 pb-8">
                    <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                        {t('wordDetail.notes')}
                    </h3>
                    {currentUserId ? (
                        <WordNote word={word} currentUserId={currentUserId} />
                    ) : (
                        <div className="text-center py-8 text-neutral-500">
                            {t('wordDetail.loginToViewNotes')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper component for links with tooltip
function WordLink({ showTooltip, onClick, ...props }: any) {
    const [hovered, setHovered] = useState(false);
    const [data, setData] = useState<{ phonetic?: string; translation?: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        setHovered(true);
        if (showTooltip && !data && !loading && props.href?.startsWith('#')) {
            const word = props.href.substring(1);
            // Debounce fetch
            timerRef.current = setTimeout(async () => {
                setLoading(true);
                try {
                    const res = await fetch(`/api/words/${word}`);
                    if (res.ok) {
                        const json = await res.json();
                        if (json.chinese) {
                            setData({
                                phonetic: json.chinese.phonetic || json.chinese.pronunciation,
                                translation: json.chinese.concise_definition
                            });
                        }
                    }
                } catch (e) {
                    // ignore error
                } finally {
                    setLoading(false);
                }
            }, 300);
        }
    };

    const handleMouseLeave = () => {
        setHovered(false);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
    };

    return (
        <span className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            <a
                {...props}
                onClick={onClick}
                className="cursor-pointer text-blue-400 hover:text-blue-300 transition-colors"
            />

            {/* Tooltip */}
            {showTooltip && hovered && data && (
                <WordTooltip
                    phonetic={data.phonetic}
                    translation={data.translation}
                    className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2"
                />
            )}
        </span>
    );
}
