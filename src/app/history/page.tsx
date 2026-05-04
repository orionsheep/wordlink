'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Clock, Award, Check, X, Eye, ChevronDown, ChevronUp } from 'lucide-react';

import { useTranslations } from 'next-intl';
import { useSettings } from '@/context/SettingsContext';
import { useDeviceType } from '@/lib/hooks/useMediaQuery';
import { useForceMobileLayout } from '@/lib/hooks';

const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false });

interface Visit {
    id: string;
    word: string;
    timestamp: string;
}

interface QuizRecord {
    id: string;
    word: string;
    testType: number; // 1=Spelling, 2=Recall
    score: number;
    timestamp: string;
}

type LibraryItem = { name: string; path: string; type: string };

function isLibraryItem(value: unknown): value is LibraryItem {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
        typeof item.name === 'string' &&
        typeof item.path === 'string' &&
        typeof item.type === 'string'
    );
}

export default function HistoryPage() {
    const t = useTranslations();
    const { groupSize } = useSettings();
    const deviceType = useDeviceType();
    const forceMobileLayout = useForceMobileLayout();
    const isMobile = deviceType === 'mobile' || forceMobileLayout;
    const [visits, setVisits] = useState<Visit[]>([]);
    const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthError, setIsAuthError] = useState(false);
    const [activeTab, setActiveTab] = useState<'visits' | 'quizzes'>('quizzes');
    const [filtersOpen, setFiltersOpen] = useState(false);

    // Filter State
    const [searchWord, setSearchWord] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Group Filter State
    const [libraries, setLibraries] = useState<{ name: string, path: string, type: string }[]>([]);
    const [selectedLibrary, setSelectedLibrary] = useState('');
    const [groups, setGroups] = useState<{ index: number, label: string }[]>([]);
    const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(-1); // -1 means no group selected

    // Fetch libraries on mount
    useEffect(() => {
        fetch('/api/libraries')
            .then(res => res.json())
            .then(data => {
                const safeData = Array.isArray(data) ? data.filter(isLibraryItem) : [];
                setLibraries(safeData.filter(item => item.type === 'file'));
            })
            .catch(() => {
                // Keep page usable even if library metadata fails
            });
    }, []);

    // Fetch groups when library changes
    useEffect(() => {
        if (selectedLibrary) {
            fetch(`/api/library-groups?path=${encodeURIComponent(selectedLibrary)}&groupSize=${groupSize}`) // Default group size 20
                .then(res => res.json())
                .then(data => {
                    setGroups(data);
                    setSelectedGroupIndex(-1);
                })
                .catch(() => {
                    setGroups([]);
                    setSelectedGroupIndex(-1);
                });
        } else {
            setGroups([]);
        }
    }, [selectedLibrary, groupSize]);

    const fetchHistory = async () => {
        setLoading(true);
        setError(null);
        setIsAuthError(false);
        const params = new URLSearchParams();
        if (searchWord) params.append('word', searchWord);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        // If group is selected, fetch words first
        if (selectedGroupIndex !== -1 && selectedLibrary) {
            try {
                const wordsRes = await fetch(`/api/library-words?path=${encodeURIComponent(selectedLibrary)}&groupIndex=${selectedGroupIndex}&groupSize=${groupSize}`);
                const words = await wordsRes.json();
                // API returns array of strings
                const wordList = words.join(',');
                params.append('words', wordList);
            } catch {
                // Ignore group lookup failure; history can still be queried
            }
        }

        try {
            const response = await fetch(`/api/user/history?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
            });

            if (response.status === 401) {
                setIsAuthError(true);
                setVisits([]);
                setQuizzes([]);
                setError('You are not logged in. Please log in first.');
                return;
            }

            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                const details =
                    typeof errorBody?.details === 'string' && errorBody.details.length > 0
                        ? ` ${errorBody.details}`
                        : '';
                setIsAuthError(false);
                setError(`Failed to load history (HTTP ${response.status}).${details}`);
                return;
            }

            const data = await response.json();
            setVisits(Array.isArray(data.visits) ? data.visits : []);
            setQuizzes(Array.isArray(data.quizzes) ? data.quizzes : []);
            setError(null);
        } catch {
            setIsAuthError(false);
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) {
        return <div className="h-screen bg-black text-white flex items-center justify-center">{t('history.loading')}</div>;
    }

    const content = (
        <div className={`min-h-screen bg-black text-white ${isMobile ? 'p-4' : 'p-8'}`}>
            <div className="max-w-4xl mx-auto">
                <div className={`flex items-center gap-4 ${isMobile ? 'mb-4' : 'mb-8'}`}>
                    <h1 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-bold`}>{t('history.title')}</h1>
                </div>

                {/* Filters - Collapsible on mobile */}
                {isMobile ? (
                    <div className="mb-4">
                        <button
                            onClick={() => setFiltersOpen(!filtersOpen)}
                            className="w-full flex items-center justify-between bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-400"
                        >
                            <span>{t('history.filters')}</span>
                            {filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {filtersOpen && (
                            <div className="mt-2 bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-3">
                                <div>
                                    <label className="block text-xs text-neutral-500 mb-1">{t('history.searchWord')}</label>
                                    <input type="text" value={searchWord} onChange={(e) => setSearchWord(e.target.value)}
                                        placeholder={t('history.searchPlaceholder')}
                                        className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:border-blue-500 outline-none" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-neutral-500 mb-1">{t('history.startDate')}</label>
                                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:border-blue-500 outline-none text-neutral-300"
                                            style={{ colorScheme: 'dark' }} />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-neutral-500 mb-1">{t('history.endDate')}</label>
                                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:border-blue-500 outline-none text-neutral-300"
                                            style={{ colorScheme: 'dark' }} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-500 mb-1">{t('history.library')}</label>
                                    <select value={selectedLibrary} onChange={(e) => setSelectedLibrary(e.target.value)}
                                        className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:border-blue-500 outline-none">
                                        <option value="">{t('history.selectLibrary')}</option>
                                        {libraries.map(lib => (<option key={lib.path} value={lib.path}>{lib.name.replace('.csv', '')}</option>))}
                                    </select>
                                </div>
                                {selectedLibrary && (
                                    <div>
                                        <label className="block text-xs text-neutral-500 mb-1">{t('history.group')}</label>
                                        <select value={selectedGroupIndex} onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                                            className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:border-blue-500 outline-none">
                                            <option value={-1}>{t('history.selectGroup')}</option>
                                            {groups.map(g => (<option key={g.index} value={g.index}>{g.label}</option>))}
                                        </select>
                                    </div>
                                )}
                                <button onClick={fetchHistory}
                                    className="w-full bg-blue-600 active:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                                    {t('history.applyFilters')}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 mb-8 flex flex-col gap-4">
                        <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs text-neutral-500 mb-1">{t('history.searchWord')}</label>
                                <input type="text" value={searchWord} onChange={(e) => setSearchWord(e.target.value)}
                                    placeholder={t('history.searchPlaceholder')}
                                    className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-neutral-500 mb-1">{t('history.startDate')}</label>
                                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none text-neutral-300" />
                            </div>
                            <div>
                                <label className="block text-xs text-neutral-500 mb-1">{t('history.endDate')}</label>
                                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none text-neutral-300" />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-4 items-end border-t border-neutral-800 pt-4">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs text-neutral-500 mb-1">{t('history.libraryOptional')}</label>
                                <select value={selectedLibrary} onChange={(e) => setSelectedLibrary(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none">
                                    <option value="">{t('history.selectLibrary')}</option>
                                    {libraries.map(lib => (<option key={lib.path} value={lib.path}>{lib.name.replace('.csv', '')}</option>))}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs text-neutral-500 mb-1">{t('history.groupOptional')}</label>
                                <select value={selectedGroupIndex} onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                                    className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                    disabled={!selectedLibrary}>
                                    <option value={-1}>{t('history.selectGroup')}</option>
                                    {groups.map(g => (<option key={g.index} value={g.index}>{g.label}</option>))}
                                </select>
                            </div>
                            <button onClick={fetchHistory}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                                {t('history.filter')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className={`flex ${isMobile ? 'gap-2 mb-4' : 'gap-4 mb-8'} border-b border-neutral-800`}>
                    <button
                        onClick={() => setActiveTab('quizzes')}
                        className={`pb-3 px-3 font-medium transition-colors relative min-h-[44px] ${isMobile ? 'text-sm flex-1' : ''} ${activeTab === 'quizzes' ? 'text-blue-500' : 'text-neutral-500'}`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <Award size={isMobile ? 16 : 18} />
                            {t('history.quizRecords')}
                        </div>
                        {activeTab === 'quizzes' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500"></div>}
                    </button>
                    <button
                        onClick={() => setActiveTab('visits')}
                        className={`pb-3 px-3 font-medium transition-colors relative min-h-[44px] ${isMobile ? 'text-sm flex-1' : ''} ${activeTab === 'visits' ? 'text-green-500' : 'text-neutral-500'}`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <Clock size={isMobile ? 16 : 18} />
                            {t('history.wordVisits')}
                        </div>
                        {activeTab === 'visits' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-green-500"></div>}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="text-red-500 text-center p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <div>{error}</div>
                        {isAuthError && (
                            <div className="mt-3">
                                <Link href="/login" className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                                    {t('history.goToLogin')}
                                </Link>
                            </div>
                        )}
                    </div>
                )}

                {/* Content - Card layout on mobile, table on desktop */}
                {isMobile ? (
                    <div className="space-y-3">
                        {activeTab === 'quizzes' ? (
                            quizzes.length === 0 ? (
                                <div className="text-center text-neutral-500 py-12 text-sm">{t('history.noQuizRecords')}</div>
                            ) : (
                                quizzes.map(q => (
                                    <div key={q.id} className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-lg font-bold text-white">{q.word}</span>
                                            {q.testType === 1 ? (
                                                <span className="flex items-center gap-1 text-blue-400 text-xs uppercase font-bold bg-blue-500/10 px-2 py-1 rounded">
                                                    <Award size={12} /> {t('history.spelling')}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-purple-400 text-xs uppercase font-bold bg-purple-500/10 px-2 py-1 rounded">
                                                    <Eye size={12} /> {t('history.recall')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-neutral-500 font-mono">
                                                {new Date(q.timestamp).toLocaleString()}
                                            </span>
                                            <span>
                                                {q.testType === 1 ? (
                                                    q.score === 2 ? <span className="text-green-500 flex items-center gap-1 text-sm"><Check size={14} /> {t('history.correct')}</span> : <span className="text-red-500 flex items-center gap-1 text-sm"><X size={14} /> {t('history.wrong')}</span>
                                                ) : (
                                                    q.score === 2 ? <span className="text-green-500 text-sm">{t('history.easy')}</span> :
                                                        q.score === 1 ? <span className="text-yellow-500 text-sm">{t('history.hard')}</span> :
                                                            <span className="text-red-500 text-sm">{t('history.unknown')}</span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )
                        ) : (
                            visits.length === 0 ? (
                                <div className="text-center text-neutral-500 py-12 text-sm">{t('history.noVisitHistory')}</div>
                            ) : (
                                visits.map(v => (
                                    <div key={v.id} className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                                        <div className="text-base font-bold text-white mb-1">{v.word}</div>
                                        <div className="text-xs text-neutral-500 font-mono">
                                            {new Date(v.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                ))
                            )
                        )}
                    </div>
                ) : (
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                        {activeTab === 'quizzes' ? (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-900 text-neutral-500 text-sm border-b border-neutral-800">
                                        <th className="p-4 font-medium">{t('history.time')}</th>
                                        <th className="p-4 font-medium">{t('history.word')}</th>
                                        <th className="p-4 font-medium">{t('history.type')}</th>
                                        <th className="p-4 font-medium">{t('history.result')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quizzes.length === 0 ? (
                                        <tr><td colSpan={4} className="p-8 text-center text-neutral-500">{t('history.noQuizRecords')}</td></tr>
                                    ) : (
                                        quizzes.map(q => (
                                            <tr key={q.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                                                <td className="p-4 text-neutral-400 text-sm font-mono">{new Date(q.timestamp).toLocaleString()}</td>
                                                <td className="p-4 font-bold text-white">{q.word}</td>
                                                <td className="p-4">
                                                    {q.testType === 1 ? (
                                                        <span className="flex items-center gap-1 text-blue-400 text-xs uppercase font-bold bg-blue-500/10 px-2 py-1 rounded w-fit"><Award size={12} /> {t('history.spelling')}</span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-purple-400 text-xs uppercase font-bold bg-purple-500/10 px-2 py-1 rounded w-fit"><Eye size={12} /> {t('history.recall')}</span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    {q.testType === 1 ? (
                                                        q.score === 2 ? <span className="text-green-500 flex items-center gap-1"><Check size={14} /> {t('history.correct')}</span> : <span className="text-red-500 flex items-center gap-1"><X size={14} /> {t('history.wrong')}</span>
                                                    ) : (
                                                        q.score === 2 ? <span className="text-green-500">{t('history.easy')}</span> :
                                                            q.score === 1 ? <span className="text-yellow-500">{t('history.hard')}</span> :
                                                                <span className="text-red-500">{t('history.unknown')}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-900 text-neutral-500 text-sm border-b border-neutral-800">
                                        <th className="p-4 font-medium">{t('history.time')}</th>
                                        <th className="p-4 font-medium">{t('history.word')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visits.length === 0 ? (
                                        <tr><td colSpan={2} className="p-8 text-center text-neutral-500">{t('history.noVisitHistory')}</td></tr>
                                    ) : (
                                        visits.map(v => (
                                            <tr key={v.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                                                <td className="p-4 text-neutral-400 text-sm font-mono">{new Date(v.timestamp).toLocaleString()}</td>
                                                <td className="p-4 font-bold text-white">{v.word}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    if (isMobile) {
        return <MobileLayout>{content}</MobileLayout>;
    }

    return content;
}
