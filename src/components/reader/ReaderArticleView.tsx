'use client';

import { useMemo } from 'react';
import { tokenizeSentence } from '@/lib/reader-engine/tokenizer';
import type { ArticleParagraphData } from '@/lib/reader-engine/types';
import { alignSentences } from '@/lib/reader-engine/sentences';

export default function ReaderArticleView({
    paragraphs,
    activeSentenceIdx,
    selectedWord,
    onSentenceClick,
    onWordClick,
}: {
    paragraphs: ArticleParagraphData[];
    activeSentenceIdx: number;
    selectedWord?: string;
    onSentenceClick: (idx: number) => void;
    onWordClick: (word: string, e: React.MouseEvent) => void;
}) {
    // 将段落按句切分并拍平为全局句子索引
    const flatSentences = useMemo(() => {
        let globalIdx = 0;
        return paragraphs.map((p, pIdx) => {
            const aligned = alignSentences(p.text_en, p.text_zh || '');
            const sentences: Array<{
                globalIdx: number;
                en: string;
                zh: string;
            }> = aligned.pairs.map((pair) => ({
                globalIdx: globalIdx++,
                en: pair.en,
                zh: pair.zh,
            }));
            return {
                paragraphIndex: pIdx,
                sentences,
            };
        });
    }, [paragraphs]);

    return (
        <div className="mx-auto max-w-3xl space-y-10 py-6">
            {flatSentences.map((p) => (
                <div
                    key={p.paragraphIndex}
                    className="liquid-glass group rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8 transition-all hover:border-white/20"
                >
                    <div className="space-y-6">
                        {p.sentences.map((sent) => {
                            const isActive = sent.globalIdx === activeSentenceIdx;
                            const tokens = tokenizeSentence(sent.en);

                            return (
                                <div
                                    key={sent.globalIdx}
                                    onClick={() => onSentenceClick(sent.globalIdx)}
                                    className={`relative cursor-pointer rounded-2xl p-4 transition-all duration-300 ${
                                        isActive
                                            ? 'border border-white/20 bg-white/[0.07] shadow-lg shadow-black/40'
                                            : 'border border-transparent hover:bg-white/[0.03]'
                                    }`}
                                >
                                    {/* 英文句子（单词可独立点击） */}
                                    <p
                                        className="font-serif-display text-xl italic leading-relaxed text-white sm:text-2xl"
                                        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
                                    >
                                        {tokens.map((tok, tIdx) => {
                                            if (!tok.isWord) {
                                                return <span key={tIdx}>{tok.text}</span>;
                                            }
                                            const isTarget =
                                                selectedWord &&
                                                selectedWord.toLowerCase() === tok.cleanWord;

                                            return (
                                                <span
                                                    key={tIdx}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onWordClick(tok.cleanWord, e);
                                                    }}
                                                    className={`inline-block rounded px-0.5 transition-all hover:bg-cyan-400/20 hover:text-cyan-200 ${
                                                        isTarget
                                                            ? 'bg-amber-400/30 text-amber-200 underline underline-offset-4'
                                                            : ''
                                                    }`}
                                                    title={`点击查看「${tok.cleanWord}」裂变星图`}
                                                >
                                                    {tok.text}
                                                </span>
                                            );
                                        })}
                                    </p>

                                    {/* 中文双语对照 */}
                                    {sent.zh && (
                                        <p
                                            className="mt-2.5 text-sm leading-relaxed text-white/55 transition-opacity"
                                            style={{ fontFamily: 'system-ui, sans-serif' }}
                                        >
                                            {sent.zh}
                                        </p>
                                    )}

                                    {/* 当前活跃发音光标 */}
                                    {isActive && (
                                        <div className="absolute -left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
