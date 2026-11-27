import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

export interface QuizWord {
    word: string;
    chineseData: {
        concise_definition: string;
        pronunciation: string;
        definitions: { explanation_cn: string }[];
    } | null;
}

interface UseQuizDataParams {
    source: 'random' | 'library' | 'unfamiliar' | 'custom' | 'due' | null;
    libraryPath?: string | null;
    groupIndex?: number | null;
    groupSize?: number;
    count?: number;
}

const QUIZ_DATA_BATCH_SIZE = 100;
const QUIZ_DATA_BATCH_CONCURRENCY = 3;

/** 错误响应（401、500……）是 {error} 对象，直接当数组用会让测验页在 words.map 上崩掉 */
async function readWordList<T>(res: Response): Promise<T[]> {
    if (!res.ok) throw new Error(`Quiz request failed (${res.status})`);
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected quiz response');
    return data as T[];
}

/**
 * `/api/quiz/data` clamps each request to 100 words. Split larger lists into
 * <= 100-word chunks and merge in the original order so words past index 100
 * are never silently truncated.
 */
async function fetchQuizDataBatched(wordList: string[], signal?: AbortSignal): Promise<QuizWord[]> {
    if (wordList.length === 0) return [];

    const chunks: string[][] = [];
    for (let i = 0; i < wordList.length; i += QUIZ_DATA_BATCH_SIZE) {
        chunks.push(wordList.slice(i, i + QUIZ_DATA_BATCH_SIZE));
    }

    const batchResults: QuizWord[][] = new Array(chunks.length);
    let nextChunkIdx = 0;

    const worker = async () => {
        while (nextChunkIdx < chunks.length) {
            const idx = nextChunkIdx;
            nextChunkIdx += 1;
            const res = await fetch('/api/quiz/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ words: chunks[idx] }),
                signal,
            });
            batchResults[idx] = await readWordList<QuizWord>(res);
        }
    };

    const workerCount = Math.min(QUIZ_DATA_BATCH_CONCURRENCY, chunks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const merged: QuizWord[] = [];
    for (const batch of batchResults) {
        if (batch) merged.push(...batch);
    }
    return merged;
}

export function useQuizData({ source, libraryPath, groupIndex, groupSize = 10, count = 10 }: UseQuizDataParams) {
    const t = useTranslations('quizPages.common');
    const [reloadTick, setReloadTick] = useState(0);
    const requestKey = source
        ? `${source}|${libraryPath ?? ''}|${groupIndex ?? ''}|${groupSize}|${count}|${reloadTick}`
        : '';

    const [state, setState] = useState<{
        key: string;
        words: QuizWord[];
        error: string | null;
    }>({
        key: '',
        words: [],
        error: null,
    });

    const refetch = useCallback(() => {
        setReloadTick((v) => v + 1);
    }, []);

    useEffect(() => {
        if (!source || !requestKey) return;

        const controller = new AbortController();
        const { signal } = controller;

        async function load() {
            try {
                let quizWords: QuizWord[] = [];
                let loadError: string | null = null;

                if (source === 'random') {
                    const res = await fetch(`/api/quiz/words?count=${count}`, { signal });
                    quizWords = await readWordList<QuizWord>(res);
                } else if (source === 'due') {
                    const res = await fetch(`/api/quiz/due?count=${count}`, {
                        credentials: 'include',
                        signal,
                    });
                    if (res.status === 401) {
                        loadError = t('loginRequired');
                    } else {
                        quizWords = await readWordList<QuizWord>(res);
                        if (quizWords.length === 0) {
                            loadError = t('noDueWords');
                        }
                    }
                } else if (source === 'unfamiliar') {
                    const res = await fetch(`/api/quiz/unfamiliar?count=${count * 2}`, {
                        credentials: 'include',
                        signal,
                    }); // Fetch more for unfamiliar
                    if (res.status === 401) {
                        loadError = t('loginRequired');
                    } else {
                        quizWords = await readWordList<QuizWord>(res);
                        if (quizWords.length === 0) {
                            loadError = t('noUnfamiliar');
                        }
                    }
                } else if (source === 'custom') {
                    const customWordsJson = sessionStorage.getItem('customQuizWords');
                    if (!customWordsJson) {
                        loadError = t('noCustomWords');
                    } else {
                        const parsed: unknown = JSON.parse(customWordsJson);
                        const customWords = Array.isArray(parsed)
                            ? parsed.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
                            : [];
                        if (customWords.length === 0) {
                            loadError = t('noCustomWords');
                        } else {
                            quizWords = await fetchQuizDataBatched(customWords, signal);
                        }
                    }
                } else if (source === 'library' && libraryPath && groupIndex !== undefined && groupIndex !== null) {
                    // Fetch words from library group
                    const wordsRes = await fetch(
                        `/api/library-words?path=${encodeURIComponent(libraryPath)}&groupIndex=${groupIndex}&groupSize=${groupSize}`,
                        { credentials: 'include', signal }
                    );
                    const wordList = await readWordList<string>(wordsRes);

                    // Fetch data for these words in <= 100-word batches
                    quizWords = await fetchQuizDataBatched(wordList, signal);
                }

                if (!signal.aborted) {
                    setState({ key: requestKey, words: quizWords, error: loadError });
                }
            } catch (err) {
                if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
                    return;
                }
                console.error('Failed to fetch quiz data:', err);
                setState({ key: requestKey, words: [], error: t('loadFailed') });
            }
        }

        void load();
        return () => controller.abort();
    }, [source, libraryPath, groupIndex, groupSize, count, requestKey, t]);

    const loading = Boolean(requestKey) && state.key !== requestKey;
    const words = state.key === requestKey ? state.words : [];
    const error = state.key === requestKey ? state.error : null;

    return { words, loading, error, refetch };
}
