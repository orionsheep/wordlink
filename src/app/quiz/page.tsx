'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Brain, Edit3, Sparkles, BookOpen, Layers, Play } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSettings } from '@/context/SettingsContext';

interface LibraryItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

interface GroupItem {
  index: number;
  label: string;
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
  const returnTo = requestedReturnTo && requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/home';
  const returnLabel = returnTo === '/home' ? tc('backToHome') : tc('backToPrevious');

  // Settings State
  const [source, setSource] = useState<'library' | 'random' | 'unfamiliar'>('library');
  const [libraries, setLibraries] = useState<LibraryItem[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string>('');
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(0);
  const [wordCount, setWordCount] = useState<number>(20);

  // Fetch libraries on mount (fetches both root user libs and syllabus files)
  useEffect(() => {
    async function loadAllLibraries() {
      try {
        const [rootRes, syllabusRes] = await Promise.all([
          fetch('/api/libraries').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/libraries?path=考试考纲').then((r) => (r.ok ? r.json() : [])),
        ]);

        const allFiles: LibraryItem[] = [
          ...rootRes.filter((item: LibraryItem) => item.type === 'file'),
          ...syllabusRes.filter((item: LibraryItem) => item.type === 'file'),
        ];

        setLibraries(allFiles);
        if (allFiles.length > 0) {
          // Default to CET4 or first syllabus file
          const defaultLib =
            allFiles.find((f) => f.path.includes('CET4')) || allFiles[0];
          setSelectedLibrary(defaultLib.path);
        }
      } catch (err) {
        console.error('Failed to load libraries:', err);
      }
    }

    loadAllLibraries();
  }, []);

  // Fetch groups when library changes
  useEffect(() => {
    if (selectedLibrary) {
      fetch(`/api/library-groups?path=${encodeURIComponent(selectedLibrary)}&groupSize=${groupSize}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: GroupItem[]) => {
          setGroups(data);
          setSelectedGroupIndex(0);
        })
        .catch(() => setGroups([]));
    } else {
      setGroups([]);
    }
  }, [selectedLibrary, groupSize]);

  const startQuiz = (mode: 'recall' | 'spelling') => {
    const params = new URLSearchParams();
    params.set('source', source);
    if (source === 'library') {
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
                      {lib.name.replace(/\.csv$/, '').replace(/^考试考纲\//, '')}
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
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <BookOpen size={15} className="text-emerald-400" />
            <span>{t('step2Title')}</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Active Recall Card */}
            <div
              onClick={() => startQuiz('recall')}
              className="group cursor-pointer p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 hover:border-blue-500/60 hover:bg-neutral-900/60 transition-all duration-300 shadow-xl flex flex-col justify-between"
            >
              <div className="space-y-2.5">
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
              <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between text-xs text-blue-400 font-semibold">
                <span>{t('startRecall')}</span>
                <Play size={13} className="group-hover:translate-x-1 transition-transform fill-current" />
              </div>
            </div>

            {/* Spelling Quiz Card */}
            <div
              onClick={() => startQuiz('spelling')}
              className="group cursor-pointer p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 hover:border-emerald-500/60 hover:bg-neutral-900/60 transition-all duration-300 shadow-xl flex flex-col justify-between"
            >
              <div className="space-y-2.5">
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
              <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>{t('startSpelling')}</span>
                <Play size={13} className="group-hover:translate-x-1 transition-transform fill-current" />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
