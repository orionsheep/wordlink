'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, X as XIcon, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuizData } from '@/hooks/useQuizData';
import { useTranslations } from 'next-intl';
import { useDeviceType } from '@/lib/hooks/useMediaQuery';
import { useForceMobileLayout } from '@/lib/hooks';

const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false });

export default function SpellingQuizPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations();
    const deviceType = useDeviceType();
    const forceMobileLayout = useForceMobileLayout();
    const isMobile = deviceType === 'mobile' || forceMobileLayout;

    // Params
    const source = searchParams.get('source') as any;
    const libraryPath = searchParams.get('library');
    const groupIndex = searchParams.get('groupIndex') ? parseInt(searchParams.get('groupIndex')!) : null;
    const groupSize = searchParams.get('groupSize') ? parseInt(searchParams.get('groupSize')!) : 10;
    const isBatchMode = searchParams.get('batch') === 'true';

    const { words, loading, error } = useQuizData({ source, libraryPath, groupIndex, groupSize });

    const [currentIndex, setCurrentIndex] = useState(0);
    const [input, setInput] = useState('');
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
    const [score, setScore] = useState(0);
    const [showResult, setShowResult] = useState(false);

    // Batch Mode State
    const [batchAnswers, setBatchAnswers] = useState<Record<number, string>>({});
    const [batchSubmitted, setBatchSubmitted] = useState(false);

    const currentWord = words[currentIndex];
    const definition = currentWord?.chineseData?.concise_definition || currentWord?.chineseData?.definitions?.[0]?.explanation_cn || 'No definition available';
    const progressPercentage = words.length > 1 ? ((currentIndex) / (words.length - 1)) * 100 : 0;

    // Reset state when group changes
    useEffect(() => {
        setCurrentIndex(0);
        setScore(0);
        setShowResult(false);
        setInput('');
        setFeedback(null);
        setBatchAnswers({});
        setBatchSubmitted(false);
    }, [groupIndex, libraryPath, source]);

    const handleSpellingSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentWord) return;

        if (input.toLowerCase().trim() === currentWord.word.toLowerCase()) {
            setFeedback('correct');
            setScore(s => s + 1);
            recordResult(currentWord.word, 1, 2);
        } else {
            setFeedback('wrong');
            recordResult(currentWord.word, 1, 0);
        }

        setTimeout(() => {
            nextCard();
        }, 1500);
    };

    const handleBatchSubmit = () => {
        let newScore = 0;
        words.forEach((w, idx) => {
            const answer = batchAnswers[idx]?.toLowerCase().trim() || '';
            const correct = w.word.toLowerCase();
            if (answer === correct) {
                newScore++;
                recordResult(w.word, 1, 2);
            } else {
                recordResult(w.word, 1, 0);
            }
        });
        setScore(newScore);
        setBatchSubmitted(true);
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
        setInput('');
        setFeedback(null);
        if (currentIndex < words.length - 1) {
            setCurrentIndex(c => c + 1);
        } else {
            setShowResult(true);
        }
    };

    const prevCard = () => {
        if (currentIndex > 0) {
            setInput('');
            setFeedback(null);
            setCurrentIndex(c => c - 1);
        }
    };

    if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">{t('common.loading')}</div>;
    if (error) return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
            <p className="text-red-500">{error}</p>
            <button onClick={() => router.push('/quiz')} className="text-blue-500 hover:underline">{t('quiz.backToMenu')}</button>
        </div>
    );

    // Result View
    if (showResult || batchSubmitted) {
        const resultContent = (
            <div className={`min-h-screen bg-black text-white flex flex-col items-center justify-center ${isMobile ? 'p-4 pt-8 pb-24' : 'p-4'}`}>
                <h1 className="text-2xl sm:text-3xl font-bold mb-4">{t('quiz.quizComplete')}</h1>
                <p className="text-lg sm:text-xl text-neutral-400 mb-8">{t('quiz.score')}: {score} / {words.length}</p>

                {isBatchMode && (
                    <div className="w-full max-w-4xl mb-8 overflow-x-auto overflow-y-auto max-h-[60vh] bg-neutral-900 rounded-xl p-4 sm:p-6 border border-neutral-800">
                        <table className="w-full text-left border-collapse min-w-[400px]">
                            <thead>
                                <tr className="text-neutral-500 border-b border-neutral-800">
                                    <th className="p-2">{t('quiz.word')}</th>
                                    <th className="p-2">{t('quiz.yourAnswer')}</th>
                                    <th className="p-2 hidden sm:table-cell">{t('quiz.definition')}</th>
                                    <th className="p-2">{t('quiz.result')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {words.map((w, idx) => {
                                    const answer = batchAnswers[idx]?.toLowerCase().trim() || '';
                                    const correct = w.word.toLowerCase();
                                    const isCorrect = answer === correct;
                                    return (
                                        <tr key={idx} className="border-b border-neutral-800/50">
                                            <td className="p-2 font-mono text-blue-400 text-sm">{w.word}</td>
                                            <td className={`p-2 font-mono text-sm ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>{batchAnswers[idx] || '-'}</td>
                                            <td className="p-2 text-neutral-400 text-sm truncate max-w-[200px] hidden sm:table-cell">{w.chineseData?.concise_definition}</td>
                                            <td className="p-2">
                                                {isCorrect ? <Check size={16} className="text-green-500" /> : <XIcon size={16} className="text-red-500" />}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <button
                    onClick={() => router.push('/quiz')}
                    className="bg-neutral-800 hover:bg-neutral-700 px-6 py-3 min-h-[48px] rounded-lg font-medium transition-colors w-full sm:w-auto max-w-xs"
                >
                    {t('quiz.backToMenu')}
                </button>
            </div>
        );

        if (isMobile) {
            return <MobileLayout>{resultContent}</MobileLayout>;
        }

        return resultContent;
    }

    // Batch Mode View
    if (isBatchMode) {
        const batchContent = (
            <div className={`min-h-screen bg-black text-white ${isMobile ? 'p-4 pt-8 pb-24' : 'p-4'}`}>
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-6 sm:mb-8 sticky top-0 bg-black/90 backdrop-blur-md py-3 sm:py-4 z-10 border-b border-neutral-800 gap-2">
                        <button
                            onClick={() => router.push('/quiz')}
                            className="text-neutral-500 hover:text-white transition-colors flex items-center gap-1 sm:gap-2 min-h-[48px] p-2 -ml-2"
                        >
                            <ArrowLeft size={20} />
                            <span className="text-sm hidden sm:inline">{t('quiz.quit')}</span>
                        </button>
                        <h2 className="text-base sm:text-xl font-bold truncate">{t('quiz.batchSpelling')}</h2>
                        <button
                            onClick={handleBatchSubmit}
                            className="bg-blue-600 hover:bg-blue-500 px-4 sm:px-6 py-2 min-h-[48px] rounded-lg font-medium transition-colors text-sm sm:text-base whitespace-nowrap"
                        >
                            {t('quiz.submitAll')}
                        </button>
                    </div>

                    <div className="space-y-3 sm:space-y-4 pb-20">
                        {words.map((w, idx) => (
                            <div key={idx} className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
                                <div>
                                    <span className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1 block">{t('quiz.definition')} {idx + 1}</span>
                                    <p className="text-neutral-300 text-sm">
                                        {w.chineseData?.concise_definition || w.chineseData?.definitions?.[0]?.explanation_cn || 'No definition'}
                                    </p>
                                </div>
                                <div className="w-full">
                                    <input
                                        type="text"
                                        value={batchAnswers[idx] || ''}
                                        onChange={(e) => setBatchAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                                        className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-3 min-h-[48px] box-border text-base text-white focus:border-blue-500 outline-none font-mono"
                                        placeholder={t('quiz.typeWord')}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );

        if (isMobile) {
            return <MobileLayout>{batchContent}</MobileLayout>;
        }

        return batchContent;
    }

    // Single Card View
    const singleCardContent = (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <button
                onClick={() => router.push('/quiz')}
                className="absolute top-4 left-4 sm:top-8 sm:left-8 text-neutral-500 hover:text-white transition-colors flex items-center gap-2 z-10 min-h-[48px] p-2 -m-2"
            >
                <ArrowLeft size={20} />
                <span className="text-sm">{t('quiz.quit')}</span>
            </button>

            {/* Unified Container (Single Card for Spelling) */}
            <div className="flex items-stretch transition-all duration-500 ease-in-out max-w-md w-full">

                {/* Main Quiz Area */}
                <div className="flex-1 w-full transition-all duration-500 flex flex-col">
                    <div className="p-4 sm:p-6 bg-neutral-900 rounded-2xl sm:rounded-3xl border border-neutral-800">
                        <div className="mb-4 flex justify-between items-center text-sm text-neutral-500">
                            <span>{t('quiz.word')} {currentIndex + 1} / {words.length}</span>
                            <span>{t('quiz.score')}: {score}</span>
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
                                    setInput('');
                                    setFeedback(null);
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

                        <div className="text-center min-h-[200px] flex flex-col justify-center">
                            <div className="mb-4 sm:mb-6">
                                <span className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2 block">{t('quiz.definition')}</span>
                                <p className="text-lg sm:text-xl text-neutral-300 font-medium">
                                    {definition}
                                </p>
                            </div>

                            <form onSubmit={handleSpellingSubmit} className="flex flex-col gap-3 sm:gap-4">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    className={`w-full bg-black border-2 rounded-xl px-3 sm:px-4 py-3 min-h-[48px] box-border text-center text-base sm:text-lg focus:outline-none transition-colors ${feedback === 'correct' ? 'border-green-500 text-green-500' :
                                        feedback === 'wrong' ? 'border-red-500 text-red-500' :
                                            'border-neutral-700 focus:border-blue-500'
                                        }`}
                                    placeholder="Type the English word..."
                                    autoFocus
                                    disabled={feedback !== null}
                                />
                                <button
                                    type="submit"
                                    disabled={feedback !== null || !input.trim()}
                                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 min-h-[48px] rounded-xl font-medium transition-colors active:bg-blue-400"
                                >
                                    {t('common.confirm')}
                                </button>
                            </form>

                            {feedback === 'correct' && (
                                <div className="mt-4 text-green-500 flex items-center justify-center gap-2 animate-bounce">
                                    <Check size={20} /> {t('quiz.correct')}!
                                </div>
                            )}
                            {feedback === 'wrong' && (
                                <div className="mt-4 text-red-500 flex items-center justify-center gap-2">
                                    <XIcon size={20} /> {t('quiz.theWordWas')}: {currentWord.word}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    if (isMobile) {
        return <MobileLayout>{singleCardContent}</MobileLayout>;
    }

    return singleCardContent;
}
