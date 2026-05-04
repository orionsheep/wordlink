'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { cacheGet, cacheSet } from '@/lib/client-cache';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Folder, ChevronLeft, ChevronDown, ChevronUp, Check, X, MessageCircle, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/context/SettingsContext';
import { useAI } from '@/components/ai/AIProvider';

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

export default function MobileWordList() {
  const router = useRouter();
  const { groupSize, showChinese, showScore } = useSettings();
  const { openWithWordGroup } = useAI();
  const parentRef = useRef<HTMLDivElement>(null);

  const [words, setWords] = useState<(string | WordWithData)[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Selection mode state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sortedWordsRef = useRef<(string | WordWithData)[]>([]);

  // Lazy initialization from localStorage
  const initialState = useMemo(() => {
    try {
      const saved = localStorage.getItem('wordListState');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  }, []);

  const [viewMode, setViewMode] = useState<'libraries' | 'words'>(
    initialState.currentLibraryName ? 'words' : (initialState.viewMode || 'libraries')
  );
  const [currentPath, setCurrentPath] = useState(initialState.currentPath || '');
  const [currentLibraryName, setCurrentLibraryName] = useState<string | null>(initialState.currentLibraryName || null);
  const [groups, setGroups] = useState<{ index: number; label: string }[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(initialState.selectedGroupIndex ?? -1);
  const [sortBy, setSortBy] = useState<'default' | 'familiarity_asc' | 'familiarity_desc'>(initialState.sortBy || 'default');
  const [progress, setProgress] = useState<Record<string, number>>({});

  // Fetch progress
  useEffect(() => {
    fetch('/api/user/progress', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setProgress(data))
      .catch(() => {});
  }, []);

  // Fetch library items
  useEffect(() => {
    if (viewMode !== 'libraries') return;
    fetch(`/api/libraries?path=${encodeURIComponent(currentPath)}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setLibraryItems(data))
      .catch(() => {});
  }, [currentPath, viewMode]);

  // Fetch groups
  useEffect(() => {
    if (viewMode !== 'words' || !currentPath || searchQuery) {
      setGroups([]);
      return;
    }
    const url = currentPath.startsWith('user:')
      ? `/api/user/libraries/${currentPath.replace('user:', '')}/groups?groupSize=${groupSize}`
      : `/api/library-groups?path=${encodeURIComponent(currentPath)}&groupSize=${groupSize}`;

    fetch(url)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        if (data.groups) {
          setGroups(data.groups.map((g: any) => ({ index: g.index, label: g.name })));
        } else {
          setGroups(data);
        }
      })
      .catch(() => {});
  }, [currentPath, viewMode, searchQuery, groupSize]);

  // Fetch words
  useEffect(() => {
    // Synchronous cache check — instant restore, no loading flash
    if (!searchQuery && currentPath && viewMode === 'words') {
      const cacheKey = `wordList:${currentPath}:${selectedGroupIndex}:${groupSize}:${showChinese}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setWords(JSON.parse(cached));
          return;
        }
      } catch { /* ignore */ }
    }

    const fetchWords = async () => {
      setLoading(true);
      try {
        let url = '/api/words';
        if (searchQuery) {
          url = `/api/words?query=${encodeURIComponent(searchQuery)}&includeDefinitions=${showChinese}`;
        } else if (viewMode === 'libraries') {
          setLoading(false);
          return;
        } else if (currentPath) {
          if (currentPath.startsWith('user:')) {
            const id = currentPath.replace('user:', '');
            url = `/api/user/libraries/${id}/words?groupIndex=${selectedGroupIndex}&groupSize=${groupSize}&includeDefinitions=${showChinese}`;
          } else {
            url = `/api/library-words?path=${encodeURIComponent(currentPath)}&groupIndex=${selectedGroupIndex}&groupSize=${groupSize}&includeDefinitions=${showChinese}`;
          }
        }
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          let parsedWords: (string | WordWithData)[];
          if (data.words) {
            if (showChinese && data.words.length > 0 && data.words[0].chineseData) {
              parsedWords = data.words.map((w: any) => ({ word: w.word, chineseData: w.chineseData }));
            } else {
              parsedWords = data.words.map((w: any) => w.word || w);
            }
          } else {
            parsedWords = data;
          }
          setWords(parsedWords);
          // Cache non-search results
          if (!searchQuery && currentPath) {
            const cacheKey = `wordList:${currentPath}:${selectedGroupIndex}:${groupSize}:${showChinese}`;
            try { sessionStorage.setItem(cacheKey, JSON.stringify(parsedWords)); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(fetchWords, 300);
    return () => clearTimeout(t);
  }, [searchQuery, currentPath, viewMode, selectedGroupIndex, groupSize, showChinese]);

  // Preload first 20 words into localStorage cache for instant page opens
  useEffect(() => {
    if (words.length === 0) return;
    const toPreload = words.slice(0, 20).map(getWordString);
    toPreload.forEach(word => {
      if (!cacheGet(`word:${word}`)) {
        fetch(`/api/words/${encodeURIComponent(word)}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
              if (data) {
                  let processed = data.content || '';
                  processed = processed.replace(/\[\[(.*?)\]\]/g, (_: string, p1: string) => `[${p1}](#${p1})`);
                  cacheSet(`word:${word}`, { content: processed, chineseData: data.chinese || null });
              }
          })
          .catch(() => {});
      }
    });
  }, [words]);

  // Save state to localStorage
  useEffect(() => {
    if (searchQuery) return;
    try {
      localStorage.setItem('wordListState', JSON.stringify({
        currentPath, currentLibraryName, viewMode, selectedGroupIndex, sortBy,
      }));
    } catch { /* ignore */ }
  }, [currentPath, currentLibraryName, viewMode, selectedGroupIndex, sortBy, searchQuery]);

  // Auto-switch viewMode
  useEffect(() => {
    if (searchQuery) {
      setViewMode('words');
    } else if (!currentLibraryName && !currentPath && viewMode === 'words') {
      setViewMode('libraries');
    }
  }, [searchQuery, currentLibraryName, currentPath, viewMode]);

  const getWordString = (item: string | WordWithData) =>
    typeof item === 'string' ? item : item.word;

  const renderCollinsStars = (collins: string | undefined) => {
    if (!collins) return null;
    const stars = parseInt(collins);
    if (isNaN(stars) || stars <= 0) return null;
    return (
      <div className="flex items-center gap-0.5 ml-1">
        {[...Array(Math.min(stars, 5))].map((_, i) => (
          <svg key={i} className="w-3 h-3 text-yellow-500 fill-current flex-shrink-0" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
      </div>
    );
  };

  const handleScroll = useCallback(() => {
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      if (parentRef.current) {
        const scrollTop = parentRef.current.scrollTop;
        sessionStorage.setItem('wordListScroll', String(scrollTop));
        // Preload 30 words starting from current visible position
        const itemHeight = showChinese ? 64 : 48;
        const firstVisible = Math.floor(scrollTop / itemHeight);
        const toPreload = sortedWordsRef.current
          .slice(firstVisible, firstVisible + 30)
          .map(getWordString);
        toPreload.forEach(word => {
          if (!cacheGet(`word:${word}`)) {
            fetch(`/api/words/${encodeURIComponent(word)}`)
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data) {
                  let processed = data.content || '';
                  processed = processed.replace(/\[\[(.*?)\]\]/g, (_: string, p1: string) => `[${p1}](#${p1})`);
                  cacheSet(`word:${word}`, { content: processed, chineseData: data.chinese || null });
                }
              })
              .catch(() => {});
          }
        });
      }
    }, 100);
  }, [showChinese]);

  // Restore scroll position after words load
  useEffect(() => {
    if (words.length === 0 || loading) return;
    const saved = sessionStorage.getItem('wordListScroll');
    if (saved && parentRef.current) {
      requestAnimationFrame(() => {
        if (parentRef.current) parentRef.current.scrollTop = Number(saved);
      });
    }
  }, [words, loading]);

  const sortedWords = useMemo(() => {
    return [...words].sort((a, b) => {
      if (sortBy === 'default') return 0;
      const scoreA = progress[getWordString(a)] || 0;
      const scoreB = progress[getWordString(b)] || 0;
      return sortBy === 'familiarity_asc' ? scoreA - scoreB : scoreB - scoreA;
    });
  }, [words, sortBy, progress]);

  // Keep ref in sync for use inside handleScroll
  useEffect(() => { sortedWordsRef.current = sortedWords; }, [sortedWords]);

  const rowVirtualizer = useVirtualizer({
    count: sortedWords.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => showChinese ? 64 : 48,
    overscan: 8,
  });

  const getProgressColor = (score: number | undefined) => {
    if (score === undefined) return 'bg-neutral-700';
    if (score >= 2) return 'bg-green-500';
    if (score === 1) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleItemClick = (item: LibraryItem) => {
    if (item.type === 'directory') {
      setCurrentPath(item.path);
    } else {
      setCurrentPath(item.path);
      setCurrentLibraryName(item.name.replace('.csv', ''));
      setViewMode('words');
      setSelectedGroupIndex(-1);
    }
  };

  const handleBackToLibraries = () => {
    setSearchQuery('');
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
    setCurrentLibraryName(null);
    setViewMode('libraries');
  };

  const handleNavigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  // Selection mode handlers
  const handleTouchStart = useCallback((word: string) => {
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);
        setIsSelectMode(true);
        setSelectedWords(new Set([word]));
      }
    }, 600);
  }, []);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleWordClick = useCallback((word: string) => {
    if (!isSelectMode) {
      router.push(`/word/${encodeURIComponent(word)}`);
      return;
    }
    setSelectedWords(prev => {
      const next = new Set(prev);
      if (next.has(word)) {
        next.delete(word);
      } else {
        next.add(word);
      }
      // Exit select mode if nothing selected
      if (next.size === 0) setIsSelectMode(false);
      return next;
    });
  }, [isSelectMode, router]);

  const handleStartQuiz = useCallback(() => {
    const words = Array.from(selectedWords);
    sessionStorage.setItem('customQuizWords', JSON.stringify(words));
    router.push('/quiz/select');
  }, [selectedWords, router]);

  const handleAskAI = useCallback(() => {
    openWithWordGroup(Array.from(selectedWords));
    setIsSelectMode(false);
    setSelectedWords(new Set());
  }, [selectedWords, openWithWordGroup]);

  const handleCancelSelect = useCallback(() => {
    setIsSelectMode(false);
    setSelectedWords(new Set());
  }, []);

  return (
    <div className="flex flex-col h-full relative">
      {/* Sticky Search Bar */}
      <div className="sticky top-0 z-10 bg-black px-4 pt-3 pb-2 border-b border-neutral-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
          <input
            type="text"
            placeholder="Search words..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-900 text-base text-neutral-200 pl-10 pr-4 py-3 rounded-xl border border-neutral-800 focus:outline-none focus:border-neutral-600"
          />
        </div>
      </div>

      {/* Navigation / Filter Controls */}
      {viewMode === 'words' && !searchQuery && currentLibraryName && (
        <div className="px-4 py-2 border-b border-neutral-800 bg-black">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToLibraries}
              className="flex items-center text-sm text-neutral-400 active:text-white min-h-[44px]"
            >
              <ChevronLeft className="w-5 h-5 mr-1" />
              {currentLibraryName}
            </button>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center text-sm text-neutral-500 min-h-[44px] px-2"
            >
              Filters {filtersOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
            </button>
          </div>

          {filtersOpen && (
            <div className="flex flex-col gap-2 pt-2 pb-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-neutral-900 text-neutral-300 text-sm border border-neutral-800 rounded-lg p-2.5"
              >
                <option value="default">Default Order</option>
                <option value="familiarity_asc">Familiarity ↑</option>
                <option value="familiarity_desc">Familiarity ↓</option>
              </select>
              {groups.length > 0 && (
                <select
                  value={selectedGroupIndex}
                  onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                  className="w-full bg-neutral-900 text-neutral-300 text-sm border border-neutral-800 rounded-lg p-2.5"
                >
                  {groups.map((g) => (
                    <option key={g.index} value={g.index}>{g.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {viewMode === 'libraries' && currentPath && (
        <div className="px-4 border-b border-neutral-800 bg-black">
          <button
            onClick={handleNavigateUp}
            className="flex items-center text-sm text-neutral-400 active:text-white min-h-[48px]"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto" ref={parentRef} onScroll={handleScroll}>
        {loading ? (
          <div className="p-3 space-y-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center px-4 py-3 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-neutral-800 mr-3" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-neutral-800 rounded w-1/3" />
                  {showChinese && <div className="h-3 bg-neutral-800/60 rounded w-2/3" />}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'libraries' && !searchQuery ? (
          /* Library List */
          <div className="p-3 space-y-1">
            {libraryItems.map((item) => (
              <button
                key={item.name}
                onClick={() => handleItemClick(item)}
                className="w-full flex items-center p-4 rounded-xl active:bg-neutral-800 transition-colors text-left"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 ${
                  item.type === 'directory'
                    ? 'bg-blue-500/10'
                    : item.source === 'user'
                      ? 'bg-purple-500/10'
                      : 'bg-green-500/10'
                }`}>
                  {item.type === 'directory' ? (
                    <Folder className="w-5 h-5 text-blue-500" />
                  ) : (
                    <svg className={`w-5 h-5 ${item.source === 'user' ? 'text-purple-500' : 'text-green-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium text-neutral-200 truncate">
                      {item.name.replace('.csv', '')}
                    </span>
                    {item.source === 'user' && (
                      <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded flex-shrink-0">
                        My Library
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {item.type === 'directory' ? 'Folder' : item.source === 'user' ? `${item.wordCount || 0} words` : 'Word List'}
                  </span>
                </div>
              </button>
            ))}
            {libraryItems.length === 0 && (
              <div className="text-center text-neutral-500 text-sm py-12">
                Empty directory
              </div>
            )}
          </div>
        ) : (
          /* Virtualized Word List */
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

              let definition = '';
              let phonetic = '';
              if (typeof item !== 'string' && item.chineseData) {
                definition = item.chineseData.concise_definition || '';
                phonetic = item.chineseData.phonetic || '';
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
                  <button
                    onClick={() => handleWordClick(wordString)}
                    onTouchStart={() => handleTouchStart(wordString)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`w-full h-full flex items-center px-4 active:bg-neutral-900 transition-colors border-b border-neutral-900/50 text-left ${
                      isSelectMode && selectedWords.has(wordString) ? 'bg-blue-500/10' : ''
                    }`}
                  >
                    {isSelectMode && (
                      <div className={`w-5 h-5 rounded-md border mr-3 flex-shrink-0 flex items-center justify-center transition-colors ${
                        selectedWords.has(wordString)
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-neutral-600'
                      }`}>
                        {selectedWords.has(wordString) && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    )}
                    {showScore && !isSelectMode && (
                      <div className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${getProgressColor(score)}`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base text-neutral-200">{wordString}</span>
                        {phonetic && (
                          <span className="text-xs text-neutral-500 font-mono">/{phonetic}/</span>
                        )}
                        {typeof item !== 'string' && item.chineseData?.collins && renderCollinsStars(item.chineseData.collins)}
                      </div>
                      {showChinese && definition && (
                        <span className="text-sm text-neutral-500 truncate block">{definition}</span>
                      )}
                    </div>
                    {!isSelectMode && <ChevronLeft className="w-4 h-4 text-neutral-700 rotate-180 flex-shrink-0" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Button for selection mode */}
      {isSelectMode && selectedWords.size > 0 && (
        <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2 z-20">
          <div className="bg-neutral-800 text-neutral-300 text-xs px-2.5 py-1 rounded-full">
            {selectedWords.size} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCancelSelect}
              className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center shadow-lg active:bg-neutral-700"
              aria-label="Cancel selection"
            >
              <X className="w-5 h-5 text-neutral-300" />
            </button>
            <button
              onClick={handleAskAI}
              className="w-11 h-11 rounded-full bg-purple-600 flex items-center justify-center shadow-lg active:bg-purple-700"
              aria-label="Ask AI about selected words"
            >
              <MessageCircle className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={handleStartQuiz}
              className="h-11 px-4 rounded-full bg-blue-600 flex items-center justify-center gap-1.5 shadow-lg active:bg-blue-700"
              aria-label="Start quiz with selected words"
            >
              <BookOpen className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white">开始测验</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
