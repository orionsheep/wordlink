'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, ChevronLeft, ChevronRight, Info, Play } from 'lucide-react';
import { useQuizData } from '@/hooks/useQuizData';
import WordDetail from '@/components/WordDetail';
import { useSettings } from '@/context/SettingsContext';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useForceMobileLayout } from '@/lib/hooks';
import { useDeviceType } from '@/lib/hooks/useMediaQuery';

const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false });

export default function RecallQuizPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Params
    const source = searchParams.get('source') as any;
    const libraryPath = searchParams.get('library');
    const groupIndex = searchParams.get('groupIndex') ? parseInt(searchParams.get('groupIndex')!) : null;
    const groupSize = searchParams.get('groupSize') ? parseInt(searchParams.get('groupSize')!) : 10;

    const { words, loading, error } = useQuizData({ source, libraryPath, groupIndex, groupSize });
    const { shortcuts } = useSettings();
    const scrollRef = useRef<HTMLDivElement>(null);
    const t = useTranslations();
    const forceMobileLayout = useForceMobileLayout();
    const deviceType = useDeviceType();
    const isMobile = deviceType === 'mobile' || forceMobileLayout;

    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    const currentWord = words[currentIndex];
    const definition = currentWord?.chineseData?.concise_definition || currentWord?.chineseData?.definitions?.[0]?.explanation_cn || 'No definition available';
    const pronunciation = currentWord?.chineseData?.pronunciation || '';
    const progressPercentage = words.length > 1 ? ((currentIndex) / (words.length - 1)) * 100 : 0;
    const shouldSplitDetailsPanel = showDetails && !forceMobileLayout;

    const handleRecallRate = (rating: 'easy' | 'hard' | 'unknown') => {
        let points = 0;
        if (rating === 'easy') points = 2;
        if (rating === 'hard') points = 1;
        if (rating === 'unknown') points = 0;

        setScore(s => s + points);
        recordResult(currentWord.word, 2, points);
        nextCard();
    };

    const recordResult = async (word: string, type: number, score: number) => {
        await fetch('/api/quiz/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word, testType: type, score }),
            credentials: 'include'
        });
    };

    const nextCard = () => {
        setRevealed(false);
        if (currentIndex < words.length - 1) {
            setCurrentIndex(c => c + 1);
        } else {
            setShowResult(true);
        }
    };

    const prevCard = () => {
        if (currentIndex > 0) {
            setRevealed(false);
            setCurrentIndex(c => c - 1);
        }
    };

    const playAudio = (type: 'US' | 'UK') => {
        if (!currentWord?.word) return;
        const word = currentWord.word;
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
            // Fallback to Google pronunciation
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

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const key = e.key.toLowerCase();

            // Audio shortcuts (always active)
            if (key === shortcuts.audio_uk.toLowerCase()) {
                e.preventDefault();
                playAudio('UK');
                return;
            }
            if (key === shortcuts.audio_us.toLowerCase()) {
                e.preventDefault();
                playAudio('US');
                return;
            }

            // Navigation shortcuts
            if (key === shortcuts.nav_prev.toLowerCase()) {
                e.preventDefault();
                prevCard();
                return;
            }
            if (key === shortcuts.nav_next.toLowerCase()) {
                e.preventDefault();
                nextCard();
                return;
            }

            if (!revealed) {
                // Not revealed: Space to reveal
                if (key === shortcuts.quiz_reveal.toLowerCase()) {
                    e.preventDefault();
                    setRevealed(true);
                }
            } else {
                // Revealed: Rate shortcuts
                if (key === shortcuts.quiz_easy.toLowerCase()) {
                    e.preventDefault();
                    handleRecallRate('easy');
                } else if (key === shortcuts.quiz_hard.toLowerCase()) {
                    e.preventDefault();
                    handleRecallRate('hard');
                } else if (key === shortcuts.quiz_unknown.toLowerCase()) {
                    e.preventDefault();
                    handleRecallRate('unknown');
                } else if (key === shortcuts.quiz_reveal.toLowerCase()) {
                    // Optional: Space to skip/next if already revealed? Or do nothing?
                    // User didn't specify. Let's do nothing or maybe toggle details?
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [revealed, shortcuts, currentWord]);

    // Reset scroll position when word changes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [currentIndex, revealed]);

    // Reset state when group changes
    useEffect(() => {
        setCurrentIndex(0);
        setScore(0);
        setShowResult(false);
        setRevealed(false);
    }, [groupIndex, libraryPath, source]);

    if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">{t('quiz.loadingQuiz')}</div>;
    if (error) return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
            <p className="text-red-500">{error}</p>
            <button onClick={() => router.push('/quiz')} className="text-blue-500 hover:underline">{t('quiz.backToMenu')}</button>
        </div>
    );

    if (showResult) {
        const nextGroupIndex = groupIndex !== null ? groupIndex + 1 : null;
        const hasNextGroup = nextGroupIndex !== null;

        const resultContent = (
            <div className={`min-h-screen bg-black text-white flex flex-col items-center justify-center ${isMobile ? 'p-4 pt-8 pb-24' : 'p-4'}`}>
                <h1 className="text-2xl sm:text-3xl font-bold mb-4">{t('quiz.quizComplete')}</h1>
                <p className="text-lg sm:text-xl text-neutral-400 mb-8">{t('quiz.youScored', { score, total: words.length * 2 })}</p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto max-w-xs sm:max-w-none">
                    <button
                        onClick={() => router.push('/quiz')}
                        className="bg-neutral-800 hover:bg-neutral-700 px-6 py-3 min-h-[48px] rounded-lg font-medium transition-colors w-full sm:w-auto"
                    >
                        {t('quiz.backToMenu')}
                    </button>
                    {hasNextGroup && libraryPath && (
                        <button
                            onClick={() => router.push(`/quiz/recall?source=library&library=${encodeURIComponent(libraryPath)}&groupIndex=${nextGroupIndex}&groupSize=${groupSize}`)}
                            className="bg-blue-600 hover:bg-blue-500 px-6 py-3 min-h-[48px] rounded-lg font-medium transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                        >
                            <Play size={16} />
                            {t('quiz.nextGroup', { index: nextGroupIndex + 1 })}
                        </button>
                    )}
                </div>
            </div>
        );

        if (isMobile) {
            return <MobileLayout>{resultContent}</MobileLayout>;
        }

        return resultContent;
    }

    const mainContent = (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <button
                onClick={() => router.push('/quiz')}
                className="absolute top-4 left-4 sm:top-8 sm:left-8 text-neutral-500 hover:text-white transition-colors flex items-center gap-2 z-10 min-h-[48px] p-2 -m-2"
            >
                <ArrowLeft size={20} />
                <span className="text-sm">{t('quiz.quit')}</span>
            </button>

            {/* Unified Container */}
            <div className={`flex flex-col ${shouldSplitDetailsPanel ? 'md:flex-row' : ''} items-stretch transition-all duration-500 ease-in-out ${showDetails
                ? shouldSplitDetailsPanel
                    ? 'gap-0 max-w-5xl bg-neutral-900 rounded-2xl sm:rounded-3xl border border-neutral-800 overflow-hidden'
                    : 'max-w-md bg-neutral-900 rounded-2xl sm:rounded-3xl border border-neutral-800 overflow-hidden'
                : 'max-w-md'} w-full`}>

                {/* Main Quiz Area */}
                <div className={`flex-1 w-full transition-all duration-500 flex flex-col ${showDetails ? (shouldSplitDetailsPanel ? 'border-b md:border-b-0 md:border-r border-neutral-800' : 'border-b border-neutral-800') : ''}`}>
                    <div className={`p-4 sm:p-6 flex flex-col h-full ${showDetails ? '' : 'bg-neutral-900 rounded-2xl sm:rounded-3xl border border-neutral-800'}`}>
                        <div className="mb-4 flex justify-between items-center text-sm text-neutral-500 flex-shrink-0">
                            <span>{t('quiz.wordProgress', { current: currentIndex + 1, total: words.length })}</span>
                            <div className="flex items-center gap-3 sm:gap-4">
                                <span>{t('quiz.score')}: {score}</span>
                                <button
                                    onClick={() => setShowDetails(!showDetails)}
                                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${showDetails ? 'text-blue-500' : 'text-neutral-500 hover:text-white'}`}
                                    title={showDetails ? t('quiz.hideDetails') : t('quiz.showDetails')}
                                >
                                    <Info size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Draggable Progress Bar */}
                        <div className="mb-4 sm:mb-6 flex items-center gap-3 sm:gap-4">
                            <span className="text-xs text-neutral-600 font-mono w-8 text-right">{currentIndex + 1}</span>
                            <input
                                type="range"
                                min="0"
                                max={words.length > 0 ? words.length - 1 : 0}
                                value={currentIndex}
                                onChange={(e) => {
                                    const newIndex = parseInt(e.target.value);
                                    setCurrentIndex(newIndex);
                                    setRevealed(false);
                                }}
                                className="flex-1 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer outline-none"
                                style={{
                                    background: `linear-gradient(to right, #2563eb ${progressPercentage}%, #262626 ${progressPercentage}%)`
                                }}
                            />
                            <span className="text-xs text-neutral-600 font-mono w-8">{words.length}</span>
                        </div>

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <button
                                onClick={prevCard}
                                disabled={currentIndex === 0}
                                className={`p-3 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-full transition-colors ${currentIndex === 0 ? 'text-neutral-800 cursor-not-allowed' : 'text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700'}`}
                                title={t('quiz.previousWord')}
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                onClick={nextCard}
                                className="p-3 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 transition-colors"
                                title={t('quiz.skipNext')}
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>

                        <div className="text-center flex-1 flex flex-col justify-center">
                            <div className="mb-4 sm:mb-6">
                                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 break-words">{currentWord?.word}</h2>
                                {pronunciation && (
                                    <p className="text-neutral-500 font-mono text-xs sm:text-sm md:text-base break-all px-2 sm:px-4 mb-3">
                                        {pronunciation}
                                    </p>
                                )}
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        onClick={() => playAudio('US')}
                                        className="min-w-[48px] min-h-[48px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 transition-colors text-xs sm:text-sm"
                                        title={t('quiz.playUS')}
                                    >
                                        <Play size={16} /> US
                                    </button>
                                    <button
                                        onClick={() => playAudio('UK')}
                                        className="min-w-[48px] min-h-[48px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 active:bg-neutral-700 transition-colors text-xs sm:text-sm"
                                        title={t('quiz.playUK')}
                                    >
                                        <Play size={16} /> UK
                                    </button>
                                </div>
                            </div>

                            {!revealed ? (
                                <button
                                    onClick={() => setRevealed(true)}
                                    className="w-full bg-blue-600 hover:bg-blue-500 py-4 min-h-[56px] rounded-xl font-bold text-base sm:text-lg transition-colors shadow-lg shadow-blue-900/20 active:bg-blue-400"
                                >
                                    {t('quiz.showMeaning')}
                                </button>
                            ) : (
                                <div className="animate-fade-in">
                                    <div className="mb-6 sm:mb-8 p-4 sm:p-6 bg-black/40 rounded-xl border border-neutral-800/50">
                                        <p className="text-neutral-200 font-medium text-base sm:text-lg leading-relaxed">
                                            {definition}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                                        <button
                                            onClick={() => handleRecallRate('unknown')}
                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 py-3 min-h-[52px] rounded-xl font-medium transition-colors active:bg-red-500/30 text-sm sm:text-base"
                                        >
                                            {t('quiz.unknown')}
                                        </button>
                                        <button
                                            onClick={() => handleRecallRate('hard')}
                                            className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 py-3 min-h-[52px] rounded-xl font-medium transition-colors active:bg-yellow-500/30 text-sm sm:text-base"
                                        >
                                            {t('quiz.hard')}
                                        </button>
                                        <button
                                            onClick={() => handleRecallRate('easy')}
                                            className="bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/20 py-3 min-h-[52px] rounded-xl font-medium transition-colors active:bg-green-500/30 text-sm sm:text-base"
                                        >
                                            {t('quiz.easy')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Detail Side Panel */}
                {showDetails && (
                    <div className={shouldSplitDetailsPanel ? 'w-full md:w-[400px] flex flex-col bg-neutral-900/50 max-h-[50vh] md:max-h-none' : 'w-full flex flex-col bg-neutral-900/50 max-h-[50vh]'}>
                        <div className="h-full w-full relative">
                            {/* Mosaic/Blur Overlay */}
                            {!revealed && (
                                <div className="absolute inset-0 z-20 backdrop-blur-xl bg-neutral-900/80 flex items-center justify-center">
                                    <div className="text-neutral-500 font-mono text-sm tracking-widest uppercase flex flex-col items-center gap-3">
                                        <Eye size={32} className="opacity-50" />
                                        <span>{t('quiz.hidden')}</span>
                                    </div>
                                </div>
                            )}

                            {/* Content */}
                            <div
                                ref={scrollRef}
                                className={`h-full w-full overflow-y-auto transition-all duration-500 ${!revealed ? 'opacity-0' : 'opacity-100'}`}
                            >
                                <div className="min-h-full w-full p-4 sm:p-6 flex flex-col justify-center">
                                    <WordDetail word={currentWord?.word} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    if (isMobile) {
        return <MobileLayout>{mainContent}</MobileLayout>;
    }

    return mainContent;
}
