'use client';

import type { AmbientWordCard } from './wordPool';

/**
 * 视觉核心：liquid-glass 单词浮层卡。
 * 进场 blur+scale 浮现 → 持续慢速漂浮 → 由父级在退场时切换 .ambient-word-exit。
 */

export default function WordFloatCard({
    card,
    exiting,
    onReplay,
}: {
    card: AmbientWordCard;
    exiting: boolean;
    onReplay: () => void;
}) {
    return (
        <div
            className={`ambient-word-wrap ${exiting ? 'ambient-word-exit' : ''}`}
            onClick={onReplay}
            role="button"
            aria-label={`重读单词 ${card.word}`}
        >
            <div className="liquid-glass ambient-float cursor-pointer rounded-[2.2rem] px-8 py-7 sm:px-12 sm:py-9 bg-black/25 backdrop-blur-md shadow-2xl">
                <div className="flex items-baseline justify-center gap-3 sm:gap-4">
                    <span className="font-serif-display italic leading-none text-white text-4xl sm:text-6xl drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)]">
                        {card.word}
                    </span>
                    {card.phonetic && (
                        <span
                            className="text-white/50 text-sm sm:text-lg"
                            style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                            {card.phonetic}
                        </span>
                    )}
                </div>
                {card.definition && (
                    <p
                        className="mt-4 text-center text-sm sm:text-base text-white/80 tracking-wide"
                        style={{ fontFamily: 'system-ui, sans-serif' }}
                    >
                        {card.definition}
                    </p>
                )}
                {card.example && (
                    <p className="font-serif-display mt-2.5 text-center text-base sm:text-xl italic text-white/45">
                        “{card.example}”
                    </p>
                )}
            </div>
        </div>
    );
}
