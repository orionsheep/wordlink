'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Mic } from 'lucide-react';
import { useForceMobileLayout } from '@/lib/hooks';
import { useDeviceType } from '@/lib/hooks/useMediaQuery';
import { useTranslations, useLocale } from 'next-intl';

const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false });

export default function QuizSelectPage() {
    const router = useRouter();
    const t = useTranslations();
    const locale = useLocale();
    const [words, setWords] = useState<string[]>([]);
    const forceMobileLayout = useForceMobileLayout();
    const deviceType = useDeviceType();
    const isMobile = deviceType === 'mobile' || forceMobileLayout;

    useEffect(() => {
        // Get custom quiz words from sessionStorage
        const customWords = sessionStorage.getItem('customQuizWords');
        if (customWords) {
            setWords(JSON.parse(customWords));
        } else {
            // No words selected, redirect back
            router.push('/');
        }
    }, [router]);

    const handleModeSelect = (mode: 'spelling' | 'recall') => {
        router.push(`/quiz/${mode}?source=custom`);
    };

    if (words.length === 0) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-neutral-500">{t('common.loading') || 'Loading...'}</div>
            </div>
        );
    }

    const content = (
        <div className={`min-h-screen bg-black text-white flex flex-col items-center justify-center ${isMobile ? 'p-4 pt-8 pb-24' : 'p-8'}`}>
            <div className={`w-full ${isMobile ? 'max-w-md' : 'max-w-2xl'}`}>
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-neutral-400 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    {t('common.back') || 'Back'}
                </button>

                {/* Title */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold mb-4">{locale === 'zh' ? '选择测试模式' : 'Select Quiz Mode'}</h1>
                    <p className="text-neutral-400">
                        {t('wordList.selected', { count: words.length })}
                    </p>
                </div>

                {/* Mode Selection Cards */}
                <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {/* Spelling Mode */}
                    <button
                        onClick={() => handleModeSelect('spelling')}
                        className="group relative bg-neutral-900 border border-neutral-800 rounded-2xl p-8 hover:border-blue-500 hover:bg-neutral-800 transition-all duration-300 text-left"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                                <BookOpen className="w-6 h-6 text-blue-500" />
                            </div>
                            <div className="px-3 py-1 bg-blue-500/10 rounded-full text-xs text-blue-500 font-medium">
                                {t('quiz.spellingCheck')}
                            </div>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-500 transition-colors">
                            {locale === 'zh' ? '拼写测试' : 'Spelling Test'}
                        </h3>
                        <p className="text-neutral-500 text-sm leading-relaxed">
                            {t('quiz.spellingSingleDescription')}
                        </p>
                        <div className="mt-6 flex items-center text-blue-500 text-sm font-medium">
                            {t('quiz.startQuiz')}
                            <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </button>

                    {/* Recall Mode */}
                    <button
                        onClick={() => handleModeSelect('recall')}
                        className="group relative bg-neutral-900 border border-neutral-800 rounded-2xl p-8 hover:border-green-500 hover:bg-neutral-800 transition-all duration-300 text-left"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                                <Mic className="w-6 h-6 text-green-500" />
                            </div>
                            <div className="px-3 py-1 bg-green-500/10 rounded-full text-xs text-green-500 font-medium">
                                {t('quiz.activeRecall')}
                            </div>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 group-hover:text-green-500 transition-colors">
                            {locale === 'zh' ? '回忆测试' : 'Active Recall'}
                        </h3>
                        <p className="text-neutral-500 text-sm leading-relaxed">
                            {t('quiz.activeRecallDescription')}
                        </p>
                        <div className="mt-6 flex items-center text-green-500 text-sm font-medium">
                            {t('quiz.startQuiz')}
                            <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </button>
                </div>

                {/* Word List Preview */}
                <div className="mt-12 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                    <h4 className="text-sm font-semibold text-neutral-400 mb-4">{locale === 'zh' ? '测试单词预览' : 'Word Preview'}</h4>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                        {words.slice(0, 20).map((word, index) => (
                            <span
                                key={index}
                                className="px-3 py-1 bg-neutral-800 rounded-lg text-sm text-neutral-300"
                            >
                                {word}
                            </span>
                        ))}
                        {words.length > 20 && (
                            <span className="px-3 py-1 bg-neutral-800 rounded-lg text-sm text-neutral-500">
                                +{words.length - 20} {locale === 'zh' ? '个' : 'more'}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    if (isMobile) {
        return <MobileLayout>{content}</MobileLayout>;
    }

    return content;
}
