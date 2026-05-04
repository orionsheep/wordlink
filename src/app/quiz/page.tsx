'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Keyboard, Eye, Settings, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useSettings } from '@/context/SettingsContext';
import { useTranslations } from 'next-intl';
import { useDeviceType } from '@/lib/hooks/useMediaQuery';
import { useForceMobileLayout } from '@/lib/hooks';

const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false });

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
    const { groupSize } = useSettings();
    const t = useTranslations();
    const deviceType = useDeviceType();
    const forceMobileLayout = useForceMobileLayout();
    const isMobile = deviceType === 'mobile' || forceMobileLayout;

    // Settings State
    const [source, setSource] = useState<'random' | 'library' | 'unfamiliar' | 'custom'>('library');
    const [libraries, setLibraries] = useState<LibraryItem[]>([]);
    const [selectedLibrary, setSelectedLibrary] = useState<string>('');
    const [groups, setGroups] = useState<GroupItem[]>([]);
    const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(0);
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [hasSavedSession, setHasSavedSession] = useState(false);

    // Check for saved session on mount
    useEffect(() => {
        const saved = localStorage.getItem('quizSession');
        if (saved) {
            setHasSavedSession(true);
        }
    }, []);

    // Fetch libraries on mount
    useEffect(() => {
        fetch('/api/libraries')
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Failed to fetch libraries');
            })
            .then(data => {
                setLibraries(data.filter((item: LibraryItem) => item.type === 'file'));
                if (data.length > 0) {
                    const firstFile = data.find((item: LibraryItem) => item.type === 'file');
                    if (firstFile) setSelectedLibrary(firstFile.path);
                }
            })
            .catch(err => {
                console.error('Failed to fetch libraries:', err);
            });
    }, []);

    // Fetch groups when library changes
    useEffect(() => {
        if (selectedLibrary) {
            fetch(`/api/library-groups?path=${encodeURIComponent(selectedLibrary)}&groupSize=${groupSize}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Failed to fetch groups');
                })
                .then(data => {
                    setGroups(data);
                })
                .catch(err => {
                    console.error('Failed to fetch groups:', err);
                });
        } else {
            setGroups([]);
        }
    }, [selectedLibrary, groupSize]);

    const startQuiz = (mode: 'spelling' | 'recall') => {
        const params = new URLSearchParams();
        params.set('source', source);
        if (source === 'library') {
            params.set('library', selectedLibrary);
            params.set('groupIndex', selectedGroupIndex.toString());
            params.set('groupSize', groupSize.toString());
        }
        if (mode === 'spelling' && isBatchMode) {
            params.set('batch', 'true');
        }

        router.push(`/quiz/${mode}?${params.toString()}`);
    };

    const resumeQuiz = () => {
        // Logic to resume would need to read local storage and redirect
        // For now, let's just redirect to the saved mode if possible, or we might need a dedicated resume handler
        // Since we split pages, resuming is trickier. We might need to store the URL in the session.
        // For this refactor, let's assume the user starts fresh or we implement resume logic later.
        // But to keep it simple and working:
        const saved = localStorage.getItem('quizSession');
        if (saved) {
            const session = JSON.parse(saved);
            // We can reconstruct the URL from session data
            const params = new URLSearchParams();
            params.set('source', session.source);
            if (session.source === 'library') {
                params.set('library', session.selectedLibrary);
                params.set('groupIndex', session.selectedGroupIndex.toString());
                params.set('groupSize', groupSize.toString()); // Assuming group size hasn't changed or we save it
            }
            router.push(`/quiz/${session.mode}?${params.toString()}`);
        }
    };

    const content = (
        <div className={`min-h-screen bg-black text-white flex flex-col items-center ${isMobile ? 'justify-start pt-8 pb-24 px-4' : 'justify-center p-4 sm:p-6 md:p-8'} relative`}>
            <Link href="/" className="absolute top-4 left-4 sm:top-8 sm:left-8 p-2 -m-2 text-neutral-500 hover:text-white transition-colors">
                <ArrowLeft size={24} />
            </Link>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent tracking-tight text-center">
                {t('quiz.title')}
            </h1>
            <p className="text-neutral-500 mb-8 md:mb-12 text-base md:text-lg text-center">{t('quiz.subtitle')}</p>

            {/* Resume Prompt */}
            {hasSavedSession && (
                <div className={`bg-blue-900/10 border border-blue-500/20 rounded-2xl p-4 mb-6 md:mb-8 w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-sm ${isMobile ? 'max-w-md' : 'max-w-2xl'}`}>
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="p-2 bg-blue-500/10 rounded-full flex-shrink-0">
                            <RotateCcw className="text-blue-400" size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-blue-100">{t('quiz.resumeTitle')}</h3>
                            <p className="text-sm text-blue-300/70">{t('quiz.resumeMessage')}</p>
                        </div>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => {
                                localStorage.removeItem('quizSession');
                                setHasSavedSession(false);
                            }}
                            className="flex-1 sm:flex-none min-h-[48px] sm:min-h-0 px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
                        >
                            {t('quiz.discard')}
                        </button>
                        <button
                            onClick={resumeQuiz}
                            className="flex-1 sm:flex-none min-h-[48px] sm:min-h-0 px-6 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-900/20"
                        >
                            {t('quiz.resume')}
                        </button>
                    </div>
                </div>
            )}

            {/* Settings Panel */}
            <div className={`bg-neutral-900/30 border border-neutral-800 rounded-2xl md:rounded-3xl p-5 sm:p-6 md:p-8 mb-8 md:mb-12 w-full backdrop-blur-md ${isMobile ? 'max-w-md' : 'max-w-2xl'}`}>
                <div className="flex items-center gap-3 mb-6 text-neutral-300">
                    <Settings size={20} />
                    <span className="font-medium text-lg">{t('quiz.settings')}</span>
                </div>

                <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                    <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">{t('quiz.source')}</label>
                        <div className="relative">
                            <select
                                value={source}
                                onChange={(e) => setSource(e.target.value as any)}
                                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 min-h-[48px] text-sm focus:border-blue-500 outline-none appearance-none text-neutral-200 transition-colors hover:border-neutral-700"
                            >
                                <option value="library">{t('quiz.wordLibrary')}</option>
                                <option value="unfamiliar">{t('quiz.unfamiliarWords')}</option>
                                <option value="random">{t('quiz.randomWords')}</option>
                                <option value="custom">{t('quiz.customSelection')}</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                            </div>
                        </div>
                    </div>

                    {source === 'library' && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">{t('quiz.library')}</label>
                                <div className="relative">
                                    <select
                                        value={selectedLibrary}
                                        onChange={(e) => setSelectedLibrary(e.target.value)}
                                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 min-h-[48px] text-sm focus:border-blue-500 outline-none appearance-none text-neutral-200 transition-colors hover:border-neutral-700"
                                    >
                                        {libraries.map(lib => (
                                            <option key={lib.path} value={lib.path}>{lib.name.replace('.csv', '')}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </div>
                                </div>
                            </div>
                            <div className={isMobile ? '' : 'md:col-span-2'}>
                                <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">{t('quiz.group')}</label>
                                <div className="relative">
                                    <select
                                        value={selectedGroupIndex}
                                        onChange={(e) => setSelectedGroupIndex(Number(e.target.value))}
                                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 min-h-[48px] text-sm focus:border-blue-500 outline-none appearance-none text-neutral-200 transition-colors hover:border-neutral-700"
                                    >
                                        {groups.map(g => (
                                            <option key={g.index} value={g.index}>{g.label}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {source === 'custom' && (
                        <div className={forceMobileLayout ? '' : 'md:col-span-2'}>
                            <p className="text-sm text-neutral-400 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
                                {t('quiz.wordsSelectedMessage')}
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-6 pt-6 border-t border-neutral-800">
                    <label className="flex items-center gap-3 cursor-pointer group select-none min-h-[48px]">
                        <div className={`w-6 h-6 rounded flex items-center justify-center border transition-colors flex-shrink-0 ${isBatchMode ? 'bg-blue-600 border-blue-600' : 'bg-transparent border-neutral-700 group-hover:border-neutral-500'}`}>
                            {isBatchMode && <Check size={14} className="text-white" />}
                        </div>
                        <input
                            type="checkbox"
                            checked={isBatchMode}
                            onChange={(e) => setIsBatchMode(e.target.checked)}
                            className="hidden"
                        />
                        <div>
                            <span className="text-sm text-neutral-300 group-hover:text-white transition-colors font-medium">{t('quiz.enableBatchMode')}</span>
                            <p className="text-xs text-neutral-500 mt-0.5">{t('quiz.batchModeDescription')}</p>
                        </div>
                    </label>
                </div>
            </div>

            <div className={`grid gap-4 md:gap-6 w-full ${isMobile ? 'grid-cols-1 max-w-md' : 'grid-cols-1 md:grid-cols-2 max-w-2xl'}`}>
                <button
                    onClick={() => startQuiz('spelling')}
                    className="group bg-neutral-900/40 border border-neutral-800 hover:border-blue-500/50 p-6 md:p-8 rounded-2xl md:rounded-3xl transition-all hover:bg-neutral-900 hover:shadow-2xl hover:shadow-blue-900/10 text-left relative overflow-hidden active:scale-[0.98]"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-10 transition-opacity duration-500 transform group-hover:scale-110">
                        <Keyboard size={120} />
                    </div>
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 md:mb-6 group-hover:bg-blue-500/20 transition-colors">
                        <Keyboard className="text-blue-500" size={24} />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold mb-2 text-white">{t('quiz.spellingCheck')}</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                        {isBatchMode ? t('quiz.spellingBatchDescription') : t('quiz.spellingSingleDescription')}
                    </p>
                </button>

                <button
                    onClick={() => startQuiz('recall')}
                    className="group bg-neutral-900/40 border border-neutral-800 hover:border-green-500/50 p-6 md:p-8 rounded-2xl md:rounded-3xl transition-all hover:bg-neutral-900 hover:shadow-2xl hover:shadow-green-900/10 text-left relative overflow-hidden active:scale-[0.98]"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-10 transition-opacity duration-500 transform group-hover:scale-110">
                        <Eye size={120} />
                    </div>
                    <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center mb-4 md:mb-6 group-hover:bg-green-500/20 transition-colors">
                        <Eye className="text-green-500" size={24} />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold mb-2 text-white">{t('quiz.activeRecall')}</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                        {t('quiz.activeRecallDescription')}
                    </p>
                </button>
            </div>
        </div>
    );

    if (isMobile) {
        return <MobileLayout>{content}</MobileLayout>;
    }

    return content;
}

function Check({ size, className }: { size: number, className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}
