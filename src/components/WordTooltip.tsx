import React from 'react';

interface WordTooltipProps {
    word?: string;
    phonetic?: string;
    translation?: string;
    className?: string;
    style?: React.CSSProperties;
}

export default function WordTooltip({ word, phonetic, translation, className = '', style }: WordTooltipProps) {
    if (!word && !phonetic && !translation) return null;

    return (
        <div
            className={`px-3 py-2 bg-neutral-900/95 border border-neutral-700 rounded shadow-xl z-50 min-w-[150px] max-w-[250px] pointer-events-none ${className}`}
            style={style}
        >
            <div className="flex flex-col items-center gap-1">
                {word && (
                    <span className="text-white font-bold text-sm mb-1">{word}</span>
                )}
                {phonetic && (
                    <span className="text-amber-400 font-mono text-xs">[{phonetic}]</span>
                )}
                {translation && (
                    <span className="text-white text-xs text-center leading-relaxed">
                        {translation.length > 30
                            ? translation.substring(0, 30) + '...'
                            : translation}
                    </span>
                )}
            </div>
            {/* Arrow - only show if not absolutely positioned with custom logic,
                but for now we keep it simple. If used in graph, we might not need the arrow or need to position it differently.
                Let's keep it as a child for now, assuming bottom-center positioning context. 
            */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-neutral-700"></div>
        </div>
    );
}
