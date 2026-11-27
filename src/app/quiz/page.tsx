'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Brain, Edit3, Sparkles, BookOpen, Layers, Play } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSettings } from '@/context/SettingsContext';
import { safeReturnPath } from '@/lib/safe-path';

interface LibraryItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
  source?: 'user';
}

interface GroupItem {
  index: number;
  label: string;
}

type QuizSource = 'due' | 'library' | 'random' | 'unfamiliar';

function resolveSourceParam(rawSource: string | null, hasLibraryId: boolean): QuizSource {
  if (rawSource === 'due') return 'due';
  if (rawSource === 'unfamiliar') return 'unfamiliar';
  if (rawSource === 'random') return 'random';
  if (rawSource === 'user' || rawSource === 'library' || hasLibraryId) return 'library';
  return 'library';
}

export default function QuizMenuPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { groupSize } = useSettings();
  const t = useTranslations('quizPages.menu');
  const tc = useTranslations('quizPages.common');

  // Keep the entry point in the URL so the menu can return to the page that
  // launched it (for example, Home -> 今日复习 -> Home).
  const requestedReturnTo = searchParams.get('from');
  const returnTo = safeReturnPath(requestedReturnTo, '/home');
  const returnLabel = returnTo === '/home' ? tc('backToHome') : tc('backToPrevious');

  const requestedSource = searchParams.get('source');
  const requestedLibraryId = searchParams.get('libraryId');
  const requestedLibraryPath = searchParams.get('library');
  const sourceQueryKey = `${requestedSource ?? ''}|${requestedLibraryId ?? ''}`;

  // Settings State
  const [sourceOverride, setSourceOverride] = useState<{ key: string; value: QuizSource } | null>(null);
  const source: QuizSource =
    sourceOverride && sourceOverride.key === sourceQueryKey
      ? sourceOverride.value
      : resolveSourceParam(requestedSource, Boolean(requestedLibraryId));
  const setSource = (next: QuizSource) => setSourceOverride({ key: sourceQueryKey, value: next });

  const [libraries, setLibraries] = useState<LibraryItem[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string>('');
  const [groupsState, setGroupsState] = useState<{ key: string; items: GroupItem[] }>({
    key: '',
    items: [],
  });
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(0);
  const wordCount = 20;

  const groupsKey = selectedLibrary ? `${selectedLibrary}|${groupSize}` : '';
  const groups = groupsKey && groupsState.key === groupsKey ? groupsState.items : [];

  // Fetch libraries on mount: the user's own libraries, then every system library file
  useEffect(() => {
    let cancelled = false;
    async function loadAllLibraries() {
      try {
        // flat=true walks every folder under data/word_library (考试考纲, EAP, ...) and lists the user's libraries once
        const items: LibraryItem[] = await fetch('/api/libraries?flat=true', { credentials: 'include' }).then((r) =>
          r.ok ? r.json() : []
        );
        if (cancelled) return;
        const allFiles: LibraryItem[] = [
          ...items.filter((item) => item.source === 'user'),
          ...items.filter((item) => item.type === 'file' && item.source !== 'user'),
        ];

        setLibraries(allFiles);
        if (allFiles.length > 0) {
          const targetUserPath = requestedLibraryId ? `user:${requestedLibraryId}` : null;
          const matchedLib =
            (targetUserPath ? allFiles.find((f) => f.path === targetUserPath) : undefined) ||
            (requestedLibraryPath ? allFiles.find((f) => f.path === requestedLibraryPath) : undefined);
          // Default to requested library if present, else CET4 or first syllabus file
          const defaultLib =
            matchedLib ||
            allFiles.find((f) => f.path.includes('CET4')) ||
            allFiles[0];
          setSelectedLibrary(defaultLib.path);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load libraries:', err);
        }
      }
    }

    void loadAllLibraries();
    return () => {
      cancelled = true;
    };
  }, [requestedLibraryId, requestedLibraryPath]);

  // Fetch groups when library changes
  useEffect(() => {
    if (!selectedLibrary) return;
    let cancelled = false;
    const currentKey = `${selectedLibrary}|${groupSize}`;
    fetch(`/api/library-groups?path=${encodeURIComponent(selectedLibrary)}&groupSize=${groupSize}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: GroupItem[]) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setGroupsState({ key: currentKey, items: list });
        if (list.some((g) => g.index === 0)) {
          setSelectedGroupIndex(0);
        } else if (list.length > 0) {
          setSelectedGroupIndex(list[0].index);
        } else {
          setSelectedGroupIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setGroupsState({ key: currentKey, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLibrary, groupSize]);

  const startQuiz = (mode: 'recall' | 'spelling') => {
    const params = new URLSearchParams();
    params.set('source', source);
    if (source === 'library') {
      if (!selectedLibrary) return;
      params.set('library', selectedLibrary);
      params.set('groupIndex', selectedGroupIndex.toString());
      params.set('groupSize', groupSize.toString());
    } else {
      params.set('count', wordCount.toString());
    }
    params.set('returnTo', returnTo);
    router.push(`/quiz/${mode}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-4 sm:p-8">
      <div className="max-w-3xl w-full space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href={returnTo}
              className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent hover:border-neutral-800 transition-all group"
              title={returnLabel}
            >
              <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform text-neutral-300" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <Sparkles className="text-blue-500" size={20} />
                <span>{t('title')}</span>
              </h1>
              <p className="text-xs text-neutral-400 mt-0.5">
                {t('subtitle')}
              </p>
            </div>
          </div>
          <Link
            href={returnTo}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-white transition-colors"
          >
            <span>{returnLabel}</span>
          </Link>
        </div>

        {/* STEP 1 (TOP): Select Word Scope */}
        <div className="p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Layers size={15} className="text-blue-400" />
              <span>{t('step1Title')}</span>
            </h2>
            {source === 'library' && groups.length > 0 && (
              <span className="text-[11px] text-neutral-500 font-mono">
                {t('groupsInfo', { count: groups.length, size: groupSize })}
              </span>
            )}
          </div>

          {/* Scope Source Switcher */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSource('due')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                source === 'due'
                  ? 'bg-amber-600/20 border-amber-500 text-white shadow-sm'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {t('sourceDue')}
            </button>
            <button
              type="button"
              onClick={() => setSource('library')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                source === 'library'
                  ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {t('sourceLibrary')}
            </button>
            <button
              type="button"
              onClick={() => setSource('unfamiliar')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                source === 'unfamiliar'
                  ? 'bg-red-600/20 border-red-500 text-white shadow-sm'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {t('sourceUnfamiliar')}
            </button>
            <button
              type="button"
              onClick={() => setSource('random')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                source === 'random'
                  ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {t('sourceRandom', { count: wordCount })}
            </button>
          </div>

          {/* Library & Group Selectors */}
          {source === 'library' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">
                  {t('selectLibrary')}
                </label>
                <select
                  value={selectedLibrary}
                  onChange={(e) => setSelectedLibrary(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:border-blue-500 outline-none transition-colors"
                >
                  {libraries.map((lib) => (
                    <option key={lib.path} value={lib.path}>
                      {/* System files keep their folder ("EAP/1-第一学期") so same-named files stay distinguishable */}
                      {(lib.source === 'user' ? lib.name : lib.path).replace(/\.csv$/, '').replace(/^考试考纲\//, '')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">
                  {t('selectGroup')}
                </label>
                <select
                  value={selectedGroupIndex}
                  onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:border-blue-500 outline-none transition-colors"
                >
                  {groups.map((g) => (
                    <option key={g.index} value={g.index}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* STEP 2 (BOTTOM): Choose Mode & Launch */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <BookOpen size={15} className="text-emerald-400" />
            <span>{t('step2Title')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Active Recall Card */}
            <button
              type="button"
              onClick={() => startQuiz('recall')}
              disabled={source === 'library' && !selectedLibrary}
              className="group w-full text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 hover:border-blue-500/60 hover:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 transition-all duration-300 shadow-xl flex flex-col justify-between"
            >
              <div className="space-y-2.5 w-full">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Brain size={20} />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                    {t('recallBadge')}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                    {t('recallTitle')}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    {t('recallDesc')}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-neutral-900 w-full flex items-center justify-between text-xs text-blue-400 font-semibold">
                <span>{t('startRecall')}</span>
                <Play size={13} className="group-hover:translate-x-1 transition-transform fill-current" />
              </div>
            </button>

            {/* Spelling Quiz Card */}
            <button
              type="button"
              onClick={() => startQuiz('spelling')}
              disabled={source === 'library' && !selectedLibrary}
              className="group w-full text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 hover:border-emerald-500/60 hover:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 transition-all duration-300 shadow-xl flex flex-col justify-between"
            >
              <div className="space-y-2.5 w-full">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Edit3 size={20} />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    {t('spellingBadge')}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                    {t('spellingTitle')}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    {t('spellingDesc')}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-neutral-900 w-full flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>{t('startSpelling')}</span>
                <Play size={13} className="group-hover:translate-x-1 transition-transform fill-current" />
              </div>
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
