'use client';

/**
 * SentenceCard —— 沉浸式阅读的句子浮层。
 *
 * 视觉语言（延续 WordLink liquid-glass 词卡体系）：
 * - 核心：liquid-glass 浮层外框（圆角、渐变发光描边、轻微毛玻璃与暗色衬底）
 * - 当前句：Instrument Serif italic 大字，逐词 staggered reveal（blur+上浮）
 * - 朗读进度：已读词 white/95，正在读 white + 底部细亮线，未读词 white/60
 * - 中文译文：英文朗读结束后 500ms 淡入（white/80 细体）
 * - 上文：上一句以 white/40 小字悬浮在卡片上方；下文：下一句 white/35 预告在卡片下方
 */

export interface ReaderSentence {
    paraIdx: number;
    sentIdx: number;
    en: string;
    zh?: string;
}

/** 主文字投影：近距锐利阴影 + 远距柔光晕 */
const TEXT_SHADOW = [
    '0 1px 3px rgba(0,0,0,0.8)',
    '0 2px 12px rgba(0,0,0,0.5)',
    '0 6px 36px rgba(0,0,0,0.35)',
].join(', ');

export default function SentenceCard({
    sentence,
    prevSentence,
    nextSentence,
    spokenWords,
    showZh,
}: {
    sentence: ReaderSentence;
    prevSentence?: ReaderSentence;
    nextSentence?: ReaderSentence;
    /** 已朗读到第几个词（-1 = 尚未开始） */
    spokenWords: number;
    showZh: boolean;
}) {
    const words = sentence.en.split(/\s+/);

    return (
        <div className="pointer-events-none flex w-full max-w-3xl flex-col items-center px-4">
            {/* 上一句余韵 */}
            {prevSentence && (
                <p
                    className="font-serif-display mb-3 max-w-2xl text-center text-sm italic leading-relaxed text-white/40 sm:text-base"
                    style={{ fontFamily: "'Instrument Serif', serif", textShadow: TEXT_SHADOW }}
                >
                    {prevSentence.en}
                </p>
            )}

            {/* 当前句：标准 liquid-glass 液态玻璃外框卡片 */}
            <div className="liquid-glass relative flex w-full max-w-2xl flex-col items-center rounded-[2.2rem] px-8 py-7 sm:px-12 sm:py-9 bg-black/25 backdrop-blur-md shadow-2xl">
                {/* 逐词浮现当前句 */}
                <p
                    key={`${sentence.paraIdx}-${sentence.sentIdx}`}
                    className="font-serif-display text-center text-3xl italic leading-[1.35] sm:text-4xl md:text-[2.6rem]"
                    style={{ fontFamily: "'Instrument Serif', serif", textShadow: TEXT_SHADOW }}
                >
                    {words.map((word, i) => {
                        const isSpoken = spokenWords > i;
                        const isSpeaking = spokenWords === i;
                        return (
                            <span
                                key={i}
                                className="ambient-word-reveal inline-block"
                                style={{
                                    animationDelay: `${i * 70}ms`,
                                    color: isSpeaking ? '#ffffff' : undefined,
                                    opacity: isSpoken ? 0.95 : undefined,
                                    borderBottom: isSpeaking ? '2px solid rgba(255,255,255,0.75)' : 'none',
                                    transition: 'color 400ms ease, border-color 400ms ease',
                                    marginRight: '0.32em',
                                    paddingBottom: isSpeaking ? '2px' : '0',
                                }}
                            >
                                {word}
                            </span>
                        );
                    })}
                </p>

                {/* 中文对照：朗读完毕后浮现 */}
                {sentence.zh && (
                    <p
                        className={`mt-4 max-w-xl text-center text-sm font-medium leading-relaxed tracking-wide text-white/80 transition-opacity duration-700 sm:text-base ${
                            showZh ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{ fontFamily: 'system-ui, sans-serif', textShadow: TEXT_SHADOW }}
                    >
                        {sentence.zh}
                    </p>
                )}
            </div>

            {/* 下一句预告 */}
            {nextSentence && (
                <p
                    className="font-serif-display mt-3.5 max-w-2xl text-center text-base italic leading-relaxed text-white/35 sm:text-lg"
                    style={{ fontFamily: "'Instrument Serif', serif", textShadow: TEXT_SHADOW }}
                >
                    {nextSentence.en}
                </p>
            )}
        </div>
    );
}
