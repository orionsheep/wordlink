'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AmbientParagraph } from '@/lib/ambient-articles-seed';
import type { ReaderSentence } from './SentenceCard';

/**
 * useArticleReader —— 沉浸式阅读播放引擎。
 *
 * 句队列调度：把文章拍平为句子流，逐句朗读（Web Speech API），
 * 朗读结束（utterance.onend）自动推进下一句；句间停顿 700ms，段间停顿 2200ms。
 * 若 TTS 被禁用或无可用音色，按 420ms/词 的估算节奏推进（静读模式）。
 */

export interface ArticleData {
    id: string;
    title: string;
    titleZh?: string | null;
    level: string;
    season?: string | null;
    source?: string;
    paragraphs: AmbientParagraph[];
    wordCount: number;
}

interface Options {
    voiceEngineRef: React.MutableRefObject<{ speak: (t: string, r?: number, onEnd?: () => void) => void; stop: () => void } | null>;
    paused: boolean;
    voiceOn: boolean;
    onFinish?: () => void;
}

function splitSentences(en: string): string[] {
    // 按句号/问号/叹号切分并保留标点
    return en
        .replace(/([.!?])\s+/g, '$1|SPLIT|')
        .split('|SPLIT|')
        .map((s) => s.trim())
        .filter(Boolean);
}

export function flattenArticle(article: ArticleData): ReaderSentence[] {
    const out: ReaderSentence[] = [];
    article.paragraphs.forEach((para, paraIdx) => {
        splitSentences(para.en).forEach((sent, i) => {
            out.push({
                paraIdx,
                sentIdx: i,
                en: sent,
                zh: para.zh,
            });
        });
    });
    return out;
}

/** 估算一句英文的朗读时长（ms）：TTS 静读兜底用 */
function estimateMs(sentence: string): number {
    const words = sentence.split(/\s+/).length;
    return Math.max(1800, words * 380 + 600);
}

export function useArticleReader({ voiceEngineRef, paused, voiceOn, onFinish }: Options) {
    const [article, setArticle] = useState<ArticleData | null>(null);
    const [cursor, setCursor] = useState(0); // 当前句索引
    const [playing, setPlaying] = useState(true);
    const [spokenWords, setSpokenWords] = useState(-1);
    const [showZh, setShowZh] = useState(false);

    const sentences = useMemo(() => (article ? flattenArticle(article) : []), [article]);
    const cancelledRef = useRef(0); // 代际取消标记：换篇/暂停时使旧回调失效

    const current: ReaderSentence | undefined = sentences[cursor];
    const prevSentence = cursor > 0 ? sentences[cursor - 1] : undefined;
    const nextSentence = cursor < sentences.length - 1 ? sentences[cursor + 1] : undefined;

    const stopAll = useCallback(() => {
        cancelledRef.current += 1;
        voiceEngineRef.current?.stop();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }, [voiceEngineRef]);

    // 换文章时重置游标
    useEffect(() => {
        setCursor(0);
        setPlaying(true);
        setShowZh(false);
        setSpokenWords(-1);
    }, [article?.id]);

    // 核心调度：当前句朗读 → 结束后推进
    useEffect(() => {
        if (!playing || paused || sentences.length === 0) return;
        if (cursor >= sentences.length) {
            onFinish?.();
            return;
        }

        const gen = ++cancelledRef.current;
        const sentence = sentences[cursor];
        const isLastOfPara =
            cursor === sentences.length - 1 || sentences[cursor + 1]?.paraIdx !== sentence.paraIdx;

        setSpokenWords(-1);
        setShowZh(false);

        let advanceTimer = 0;

        // 中文译文在朗读开始 2.2s 后浮现（与朗读并行，不打断节奏）
        const zhTimer = window.setTimeout(() => setShowZh(true), 2200);

        // 词级进度模拟：朗读期间匀速点亮单词
        const wordCount = sentence.en.split(/\s+/).length;
        const estMs = estimateMs(sentence.en);
        const progressTimer = window.setInterval(() => {
            setSpokenWords((w) => (w < wordCount ? w + 1 : w));
        }, estMs / (wordCount + 2));

        const advance = () => {
            if (cancelledRef.current !== gen) return;
            window.clearInterval(progressTimer);
            setShowZh(true);
            const pause = isLastOfPara ? 2400 : 800;
            advanceTimer = window.setTimeout(
                () => {
                    if (cancelledRef.current !== gen) return;
                    setCursor((c) => c + 1);
                },
                pause,
            );
        };

        if (voiceOn && voiceEngineRef.current) {
            // TTS 朗读：onend 精准推进；8s 兜底防止引擎卡死
            let advancedByEnd = false;
            const guardedAdvance = () => {
                if (!advancedByEnd) {
                    advancedByEnd = true;
                    advance();
                }
            };
            const safety = window.setTimeout(guardedAdvance, estimateMs(sentence.en) * 1.9 + 1500);
            voiceEngineRef.current.speak(sentence.en, 0.86, () => {
                window.clearTimeout(safety);
                guardedAdvance();
            });
        } else {
            // 静读模式：按估算节奏推进
            advanceTimer = window.setTimeout(advance, estMs);
        }

        return () => {
            cancelledRef.current += 1;
            window.clearTimeout(zhTimer);
            window.clearTimeout(advanceTimer);
            window.clearInterval(progressTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cursor, playing, paused, sentences, voiceOn]);

    // 卸载/暂停时停止语音
    useEffect(() => {
        if (paused || !playing) {
            stopAll();
        }
    }, [paused, playing, stopAll]);

    useEffect(() => {
        return () => stopAll();
    }, [stopAll]);

    const jumpTo = useCallback((idx: number) => {
        setCursor(idx);
        setSpokenWords(-1);
    }, []);

    const restart = useCallback(() => {
        setCursor(0);
        setPlaying(true);
        setSpokenWords(-1);
        setShowZh(false);
    }, []);

    return {
        article,
        setArticle,
        sentences,
        current,
        prevSentence,
        nextSentence,
        cursor,
        playing,
        setPlaying,
        spokenWords,
        showZh,
        jumpTo,
        restart,
        totalSentences: sentences.length,
    };
}
