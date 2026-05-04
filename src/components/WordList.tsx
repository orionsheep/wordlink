'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Folder, ChevronLeft, CheckSquare, Square, Play, Circle, Settings, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/context/SettingsContext';
import SettingsModal from './SettingsModal';
import { useAI } from './ai/AIProvider';
import { useTranslations } from 'next-intl';

interface WordListProps {
    onWordSelect: (word: string) => void;
    selectedWord: string | null;
    isSidebarCollapsed: boolean;
    onToggleSidebar: () => void;
    transparent?: boolean;
    onOpenSettings: () => void;
}

interface LibraryItem {
    name: string;
    type: 'file' | 'directory';
    path: string;
    source?: 'system' | 'user';
    libraryId?: string;
    wordCount?: number;
}

interface WordWithData {
    word: string;
    chineseData: {
        concise_definition?: string;
        phonetic?: string;
        collins?: string;
    } | null;
}

export default function WordList({ onWordSelect, selectedWord, isSidebarCollapsed, onToggleSidebar, transparent = false, onOpenSettings }: WordListProps) {
    const router = useRouter();
    const { groupSize, showChinese, showScore, shortcuts, aiEnabled } = useSettings();
    const { openWithWordGroup } = useAI();
    const t = useTranslations();
    // const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Moved to parent

    const [words, setWords] = useState<(string | WordWithData)[]>([]);
    const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);

    // Lazy initialization from localStorage - use useMemo to compute only once
    const initialState = useMemo(() => {
        try {
            const savedState = localStorage.getItem('wordListState');
            if (savedState) {
                const parsed = JSON.parse(savedState);
                console.log('Loading initial WordList state:', parsed);
                return parsed;
            }
        } catch (error) {
            console.error('Failed to load initial WordList state:', error);
        }
        return {};
    }, []); // Empty dependency array - only compute once

    const [viewMode, setViewMode] = useState<'libraries' | 'words'>(
        initialState.currentLibraryName ? 'words' : (initialState.viewMode || 'libraries')
    );
    const [currentPath, setCurrentPath] = useState(initialState.currentPath || '');
    const [currentLibraryName, setCurrentLibraryName] = useState<string | null>(initialState.currentLibraryName || null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const parentRef = useRef<HTMLDivElement>(null);

    const [groups, setGroups] = useState<{ index: number; label: string }[]>([]);
    const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(initialState.selectedGroupIndex ?? -1);
    const [sortBy, setSortBy] = useState<'default' | 'familiarity_asc' | 'familiarity_desc'>(initialState.sortBy || 'default');

    // New Features State
    const [progress, setProgress] = useState<Record<string, number>>({});
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedWordsForQuiz, setSelectedWordsForQuiz] = useState<Set<string>>(new Set());
    const [scrollRestored, setScrollRestored] = useState(false); // Track if scroll has been restored
    const [savedScrollPosition] = useState(initialState.scrollPosition || 0); // Save scroll position to state

    // Fetch progress on mount
    useEffect(() => {
        fetch('/api/user/progress', {
            credentials: 'include'
        })
            .then(res => res.json())
            .then(data => setProgress(data))
            .catch(err => console.error('Failed to fetch progress', err));
    }, []);

    // Fetch library items when currentPath changes
    useEffect(() => {
        const fetchLibraryItems = async () => {
            if (viewMode !== 'libraries') return;

            try {
                const res = await fetch(`/api/libraries?path=${encodeURIComponent(currentPath)}`);
                if (res.ok) {
                    const data = await res.json();
                    setLibraryItems(data);
                }
            } catch (error) {
                console.error('Failed to fetch library items', error);
            }
        };
        fetchLibraryItems();
    }, [currentPath, viewMode]);

    // Fetch groups when a library is selected
    useEffect(() => {
        const fetchGroups = async () => {
            if (viewMode === 'words' && currentPath && !searchQuery) {
                try {
                    let url;
                    // Check if it's a user library
                    if (currentPath.startsWith('user:')) {
                        const libraryId = currentPath.replace('user:', '');
                        url = `/api/user/libraries/${libraryId}/groups?groupSize=${groupSize}`;
                    } else {
                        url = `/api/library-groups?path=${encodeURIComponent(currentPath)}&groupSize=${groupSize}`;
                    }

                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        // Handle different response formats
                        if (data.groups) {
                            // User library format - convert to system format
                            const formattedGroups = data.groups.map((g: any) => ({
                                index: g.index,
                                label: g.name,
                            }));
                            setGroups(formattedGroups);
                        } else {
                            // System library format
                            setGroups(data);
                        }
                        // Don't reset selectedGroupIndex - preserve the restored value from localStorage
                        // The initial value was already set during useState initialization
                    }
                } catch (error) {
                    console.error('Failed to fetch groups', error);
                }
            } else {
                setGroups([]);
            }
        };
        fetchGroups();
    }, [currentPath, viewMode, searchQuery, groupSize]);

    // Fetch words based on search or selected library
    useEffect(() => {
        const fetchWords = async () => {
            setLoading(true);
            try {
                let url = '/api/words';

                // If searching, use global search
                if (searchQuery) {
                    url = `/api/words?query=${encodeURIComponent(searchQuery)}&includeDefinitions=${showChinese}`;
                }
                // If in library view, don't fetch words yet
                else if (viewMode === 'libraries') {
                    setLoading(false);
                    return;
                }
                // If in words view (and not searching), fetch from current library file
                else if (currentPath) {
                    // Check if it's a user library (path starts with "user:")
                    if (currentPath.startsWith('user:')) {
                        const libraryId = currentPath.replace('user:', '');
                        url = `/api/user/libraries/${libraryId}/words?groupIndex=${selectedGroupIndex}&groupSize=${groupSize}&includeDefinitions=${showChinese}`;
                    } else {
                        url = `/api/library-words?path=${encodeURIComponent(currentPath)}&groupIndex=${selectedGroupIndex}&groupSize=${groupSize}&includeDefinitions=${showChinese}`;
                    }
                }

                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    // Handle different response formats
                    if (data.words) {
                        // User library response format
                        // Preserve enriched data structure if available
                        if (showChinese && data.words.length > 0 && data.words[0].chineseData) {
                            // If returned data contains enriched chineseData, preserve full structure
                            setWords(data.words.map((w: any) => ({
                                word: w.word,
                                chineseData: w.chineseData
                            })));
                        } else {
                            // If only simple word list, extract word strings
                            setWords(data.words.map((w: any) => w.word || w));
                        }
                    } else {
                        // System library response format
                        setWords(data);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch words', error);
            } finally {
                setLoading(false);
            }
        };

        // Debounce search
        const timeoutId = setTimeout(() => {
            fetchWords();
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery, currentPath, viewMode, selectedGroupIndex, groupSize, showChinese]);

    // Save WordList state to localStorage when key states change
    useEffect(() => {
        if (!searchQuery) { // Only save if not in search mode
            try {
                // Also save scroll position
                const scrollTop = parentRef.current?.scrollTop || 0;
                const stateToSave = {
                    currentPath,
                    currentLibraryName,
                    viewMode,
                    selectedGroupIndex,
                    sortBy,
                    scrollPosition: scrollTop,
                };
                localStorage.setItem('wordListState', JSON.stringify(stateToSave));
                console.log('WordList state saved:', stateToSave);
            } catch (error) {
                console.error('Failed to save WordList state:', error);
            }
        }
    }, [currentPath, currentLibraryName, viewMode, selectedGroupIndex, sortBy, searchQuery]);

    // Listen to scroll events and save scroll position
    useEffect(() => {
        const scrollElement = parentRef.current;
        if (!scrollElement || searchQuery) return; // Don't save during search

        let scrollSaveTimer: NodeJS.Timeout;
        const handleScroll = () => {
            // Debounce: save scroll position 500ms after user stops scrolling
            clearTimeout(scrollSaveTimer);
            scrollSaveTimer = setTimeout(() => {
                const scrollTop = scrollElement.scrollTop;
                if (scrollTop > 0) { // Only save if actually scrolled
                    try {
                        const currentState = localStorage.getItem('wordListState');
                        if (currentState) {
                            const parsed = JSON.parse(currentState);
                            parsed.scrollPosition = scrollTop;
                            localStorage.setItem('wordListState', JSON.stringify(parsed));
                            console.log('Scroll position saved:', scrollTop);
                        }
                    } catch (error) {
                        console.error('Failed to save scroll position:', error);
                    }
                }
            }, 500);
        };

        scrollElement.addEventListener('scroll', handleScroll);
        return () => {
            scrollElement.removeEventListener('scroll', handleScroll);
            clearTimeout(scrollSaveTimer);
        };
    }, [searchQuery, currentPath]); // Re-attach when path changes

    // Restore scroll position after words are loaded
    useEffect(() => {
        if (words.length > 0 && savedScrollPosition > 0 && !scrollRestored && parentRef.current) {
            // Use longer timeout to ensure virtualizer is fully initialized
            const timer = setTimeout(() => {
                if (parentRef.current && !scrollRestored) {
                    console.log('Attempting to restore scroll position:', savedScrollPosition);
                    parentRef.current.scrollTop = savedScrollPosition;
                    // Trigger scroll event to update virtualizer
                    parentRef.current.dispatchEvent(new Event('scroll', { bubbles: true }));
                    setScrollRestored(true);
                }
            }, 500); // Increased timeout for better reliability

            return () => clearTimeout(timer);
        }
    }, [words.length, savedScrollPosition, scrollRestored]); // All dependencies are stable

    // Auto-switch viewMode based on state
    useEffect(() => {
        if (searchQuery) {
            // If searching, always switch to words view
            setViewMode('words');
        } else if (!currentLibraryName && !currentPath && viewMode === 'words') {
            // If no library/path selected but in words view, go back to libraries
            setViewMode('libraries');
        }
    }, [searchQuery, currentLibraryName, currentPath, viewMode]);

    // Sort words
    const sortedWords = useMemo(() => {
        return [...words].sort((a, b) => {
            if (sortBy === 'default') return 0;

            const wordA = typeof a === 'string' ? a : a.word;
            const wordB = typeof b === 'string' ? b : b.word;

            const scoreA = progress[wordA] || 0;
            const scoreB = progress[wordB] || 0;

            if (sortBy === 'familiarity_asc') {
                return scoreA - scoreB;
            } else {
                return scoreB - scoreA;
            }
        });
    }, [words, sortBy, progress]);

    const rowVirtualizer = useVirtualizer({
        count: sortedWords.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => showChinese ? 60 : 40,
        overscan: 5,
    });

    const handleItemClick = (item: LibraryItem) => {
        if (item.type === 'directory') {
            setCurrentPath(item.path);
        } else {
            // It's a file, show words
            setCurrentPath(item.path);
            setCurrentLibraryName(item.name.replace('.csv', ''));
            setViewMode('words');
            // Reset group index when switching libraries
            setSelectedGroupIndex(-1);
        }
    };

    const handleNavigateUp = () => {
        if (!currentPath) return;
        const parts = currentPath.split('/');
        parts.pop();
        setCurrentPath(parts.join('/'));
    };

    const handleBackToLibraries = () => {
        setSearchQuery('');
        const parts = currentPath.split('/');
        parts.pop();
        setCurrentPath(parts.join('/'));
        setCurrentLibraryName(null);
        setViewMode('libraries');
        setIsSelectMode(false);
        setSelectedWordsForQuiz(new Set());
    };

    const toggleSelectMode = () => {
        setIsSelectMode(!isSelectMode);
        setSelectedWordsForQuiz(new Set());
    };

    const toggleSelectAll = () => {
        if (selectedWordsForQuiz.size === sortedWords.length) {
            // Deselect all
            setSelectedWordsForQuiz(new Set());
        } else {
            // Select all
            const allWords = new Set(sortedWords.map(getWordString));
            setSelectedWordsForQuiz(allWords);
        }
    };

    const toggleWordSelection = (word: string) => {
        const newSet = new Set(selectedWordsForQuiz);
        if (newSet.has(word)) {
            newSet.delete(word);
        } else {
            newSet.add(word);
        }
        setSelectedWordsForQuiz(newSet);
    };

    const startCustomQuiz = () => {
        if (selectedWordsForQuiz.size === 0) return;
        sessionStorage.setItem('customQuizWords', JSON.stringify(Array.from(selectedWordsForQuiz)));
        router.push('/quiz/select');
    };

    const getProgressColor = (score: number | undefined) => {
        if (score === undefined) return 'text-neutral-700'; // Not seen
        if (score >= 2) return 'text-green-500'; // Mastered
        if (score === 1) return 'text-yellow-500'; // Hard
        return 'text-red-500'; // Unknown/Wrong
    };

    const renderCollinsStars = (collins: string | undefined) => {
        if (!collins) return null;
        const stars = parseInt(collins);
        if (isNaN(stars) || stars <= 0) return null;

        return (
            <div className="flex items-center gap-0.5 ml-2" title={`${t('wordList.collinsStars')}: ${stars}`}>
                {[...Array(stars)].map((_, i) => (
                    <svg key={i} className="w-3 h-3 text-yellow-500 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                ))}
            </div>
        );
    };

    const getWordString = (item: string | WordWithData) => {
        return typeof item === 'string' ? item : item.word;
    };

    // Keyboard navigation for list (W/S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const key = e.key.toLowerCase();
            const prevKey = shortcuts.list_prev.toLowerCase();
            const nextKey = shortcuts.list_next.toLowerCase();

            if (key === prevKey || key === nextKey) {
                e.preventDefault();

                const currentWordStr = selectedWord;
                const currentIndex = sortedWords.findIndex(item => (typeof item === 'string' ? item : item.word) === currentWordStr);

                if (currentIndex === -1) {
                    if (sortedWords.length > 0) {
                        const newWord = typeof sortedWords[0] === 'string' ? sortedWords[0] : sortedWords[0].word;
                        onWordSelect(newWord);
                        rowVirtualizer.scrollToIndex(0, { align: 'center' });
                    }
                    return;
                }

                let newIndex = currentIndex;
                if (key === prevKey) {
                    // Previous
                    newIndex = Math.max(0, currentIndex - 1);
                } else {
                    // Next
                    newIndex = Math.min(sortedWords.length - 1, currentIndex + 1);
                }

                if (newIndex !== currentIndex) {
                    const newItem = sortedWords[newIndex];
                    const newWord = typeof newItem === 'string' ? newItem : newItem.word;
                    onWordSelect(newWord);
                    rowVirtualizer.scrollToIndex(newIndex, { align: 'center' });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedWord, sortedWords, onWordSelect, rowVirtualizer, shortcuts]);

    if (isSidebarCollapsed) {
        return null;
    }

    return (
        <div className={`h-full flex flex-col ${transparent ? 'bg-transparent' : 'bg-black border-r border-neutral-800'} relative`}>
            {/* ... (Search Header) */}
            {/* SettingsModal moved to ThreeColumnLayout */}

            <div className="p-4 border-b border-neutral-800">
                <div className="relative flex items-center gap-2">
                    <button
                        onClick={onToggleSidebar}
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                        title={t('wordList.toggleSidebar')}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                        </svg>
                    </button>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 w-4 h-4" />
                        <input
                            type="text"
                            placeholder={t('wordList.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-neutral-900 text-neutral-200 pl-9 pr-4 py-2 rounded-lg border border-neutral-800 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 text-sm placeholder-neutral-600"
                        />
                    </div>
                    <button
                        onClick={onOpenSettings}
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                        title={t('wordList.settings')}
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            {/* Navigation Header (Back Button / Up Button) */}
            {viewMode === 'words' && !searchQuery && currentLibraryName && (
                <div className="px-4 py-2 border-b border-neutral-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={handleBackToLibraries}
                            className="flex items-center text-sm text-neutral-400 hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            {t('wordList.back')}
                        </button>

                        <div className="flex items-center gap-2">
                            {/* Sort Dropdown */}
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="bg-neutral-900 text-neutral-400 text-xs border border-neutral-800 rounded p-1 focus:outline-none focus:border-blue-500 max-w-[100px]"
                                title={t('wordList.sortBy')}
                            >
                                <option value="default">{t('wordList.defaultOrder')}</option>
                                <option value="familiarity_asc">{t('wordList.familiarityAsc')}</option>
                                <option value="familiarity_desc">{t('wordList.familiarityDesc')}</option>
                            </select>

                            <button
                                onClick={toggleSelectMode}
                                className={`p-1 rounded ${isSelectMode ? 'bg-blue-500/20 text-blue-500' : 'text-neutral-500 hover:text-white'}`}
                                title={t('wordList.selectWordsForQuiz')}
                            >
                                <CheckSquare size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Group Selector */}
                    {groups.length > 0 && (
                        <select
                            value={selectedGroupIndex}
                            onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                            className="w-full bg-neutral-900 text-neutral-300 text-xs border border-neutral-800 rounded p-1 focus:outline-none focus:border-blue-500"
                        >
                            {groups.map((group) => (
                                <option key={group.index} value={group.index}>
                                    {group.label}
                                </option>
                            ))}
                        </select>
                    )}

                    {isSelectMode && (
                        <div className="flex items-center justify-between bg-neutral-900 p-2 rounded border border-neutral-800">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-neutral-400">{t('wordList.selected', { count: selectedWordsForQuiz.size })}</span>
                                <button
                                    onClick={toggleSelectAll}
                                    className="text-xs text-blue-500 hover:text-blue-400 underline"
                                >
                                    {selectedWordsForQuiz.size === sortedWords.length ? t('wordList.deselectAll') : t('wordList.selectAll')}
                                </button>
                            </div>
                            <button
                                onClick={startCustomQuiz}
                                disabled={selectedWordsForQuiz.size === 0}
                                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded"
                            >
                                <Play size={10} /> {t('wordList.quiz')}
                            </button>
                            {aiEnabled && (
                                <button
                                    onClick={() => openWithWordGroup(Array.from(selectedWordsForQuiz))}
                                    disabled={selectedWordsForQuiz.size === 0}
                                    className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded ml-2"
                                >
                                    <Sparkles size={10} /> {t('wordList.askAI')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Folder Navigation Header (Up Button) */}
            {viewMode === 'libraries' && currentPath && (
                <div className="px-4 py-2 border-b border-neutral-800 flex items-center">
                    <button
                        onClick={handleNavigateUp}
                        className="flex items-center text-sm text-neutral-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        {t('wordList.back')}
                    </button>
                    <span className="ml-auto text-xs text-neutral-500 font-mono truncate max-w-[150px]">
                        {currentPath.split('/').pop()}
                    </span>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto" ref={parentRef}>
                {loading ? (
                    <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
                        {t('wordList.loading')}
                    </div>
                ) : viewMode === 'libraries' && !searchQuery ? (
                    // Libraries List (Folders & Files)
                    <div className="p-2 grid grid-cols-1 gap-1">
                        {libraryItems.map((item) => (
                            <button
                                key={item.name}
                                onClick={() => handleItemClick(item)}
                                className="flex items-center p-3 rounded-lg hover:bg-neutral-900 transition-colors text-left group"
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-colors ${item.type === 'directory'
                                    ? 'bg-blue-500/10 group-hover:bg-blue-500/20'
                                    : item.source === 'user'
                                        ? 'bg-purple-500/10 group-hover:bg-purple-500/20'
                                        : 'bg-green-500/10 group-hover:bg-green-500/20'
                                    }`}>
                                    {item.type === 'directory' ? (
                                        <Folder className="w-4 h-4 text-blue-500" />
                                    ) : (
                                        <svg className={`w-4 h-4 ${item.source === 'user' ? 'text-purple-500' : 'text-green-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-medium text-neutral-200 group-hover:text-white">
                                            {item.name.replace('.csv', '')}
                                        </div>
                                        {item.source === 'user' && (
                                            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                                {t('wordList.myLibrary')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-neutral-500">
                                        {item.type === 'directory' ? t('wordList.folder') : item.source === 'user' ? t('wordList.wordsCount', { count: item.wordCount || 0 }) : t('wordList.file')}
                                    </div>
                                </div>
                            </button>
                        ))}
                        {libraryItems.length === 0 && (
                            <div className="text-center text-neutral-500 text-sm py-8">
                                {t('wordList.emptyDirectory')}
                            </div>
                        )}
                    </div>
                ) : (
                    // Words List (Virtualized)
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const item = sortedWords[virtualRow.index];
                            const wordString = getWordString(item);
                            const score = progress[wordString];
                            const isSelected = selectedWordsForQuiz.has(wordString);

                            // Definition extraction
                            let definition = '';
                            let phonetic = '';
                            let collins = '';

                            if (typeof item !== 'string' && item.chineseData) {
                                definition = item.chineseData.concise_definition || '';
                                phonetic = item.chineseData.phonetic || '';
                                collins = item.chineseData.collins || '';
                            }

                            return (
                                <div
                                    key={virtualRow.index}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <div
                                        className={`w-full h-full flex items-center px-4 hover:bg-neutral-900 transition-colors border-b border-neutral-900/50 ${isSelectMode ? 'cursor-pointer' : ''}`}
                                        onClick={() => isSelectMode && toggleWordSelection(wordString)}
                                    >
                                        {isSelectMode ? (
                                            <div className="mr-3 text-neutral-500">
                                                {isSelected ? <CheckSquare size={16} className="text-blue-500" /> : <Square size={16} />}
                                            </div>
                                        ) : showScore && (
                                            <Circle size={8} className={`mr-3 ${getProgressColor(score)} fill-current flex-shrink-0`} />
                                        )}

                                        <button
                                            onClick={(e) => {
                                                if (isSelectMode) {
                                                    // Don't stop propagation - let parent handle it
                                                    // Or explicitly toggle here
                                                    toggleWordSelection(wordString);
                                                    return;
                                                }
                                                onWordSelect(wordString);
                                            }}
                                            className={`flex-1 text-left truncate flex flex-col justify-center ${selectedWord === wordString && !isSelectMode
                                                ? 'text-white'
                                                : 'text-neutral-400 hover:text-neutral-200'
                                                }`}
                                        >
                                            <div className="flex items-center">
                                                <span className={`text-sm ${selectedWord === wordString ? 'font-medium' : ''}`}>{wordString}</span>
                                                {phonetic && (
                                                    <span className="text-xs text-neutral-500 font-mono ml-2">/{phonetic}/</span>
                                                )}
                                                {renderCollinsStars(collins)}
                                            </div>
                                            {showChinese && definition && (
                                                <span className="text-xs text-neutral-600 truncate">{definition}</span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
