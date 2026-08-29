'use client';

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';

export default function ReaderAudioBar({
    playing,
    currentSentenceIdx,
    totalSentences,
    playbackRate,
    onTogglePlay,
    onPrevSentence,
    onNextSentence,
    onRestart,
    onChangeRate,
    drawerOpen = false,
    drawerWidth = 480,
}: {
    playing: boolean;
    currentSentenceIdx: number;
    totalSentences: number;
    playbackRate: number;
    onTogglePlay: () => void;
    onPrevSentence: () => void;
    onNextSentence: () => void;
    onRestart: () => void;
    onChangeRate: (rate: number) => void;
    drawerOpen?: boolean;
    drawerWidth?: number;
}) {
    const RATES = [0.75, 1.0, 1.25, 1.5];

    return (
        <div
            data-drawer-open={drawerOpen ? 'true' : 'false'}
            className="reader-audio-bar fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 transition-[right] duration-300"
            style={{ '--reader-drawer-width': `${drawerWidth}px` } as React.CSSProperties}
        >
            <div className="liquid-glass flex items-center gap-3 rounded-full border border-white/15 bg-black/60 px-5 py-3 shadow-2xl backdrop-blur-xl sm:gap-4 sm:px-6">
                {/* 重播 */}
                <button
                    type="button"
                    onClick={onRestart}
                    aria-label="从头播放"
                    title="从头播放"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all hover:bg-white/10 hover:text-white"
                >
                    <RotateCcw size={15} />
                </button>

                {/* 上一句 */}
                <button
                    type="button"
                    onClick={onPrevSentence}
                    disabled={currentSentenceIdx <= 0}
                    aria-label="上一句"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white/75 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                    <ChevronLeft size={18} />
                </button>

                {/* 播放 / 暂停 */}
                <button
                    type="button"
                    onClick={onTogglePlay}
                    aria-label={playing ? '暂停朗读' : '播放当前句'}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                    {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>

                {/* 下一句 */}
                <button
                    type="button"
                    onClick={onNextSentence}
                    disabled={currentSentenceIdx >= totalSentences - 1}
                    aria-label="下一句"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white/75 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30"
                >
                    <ChevronRight size={18} />
                </button>

                {/* 进度 */}
                <div className="hidden items-center gap-1.5 px-2 text-xs tabular-nums text-white/50 sm:flex">
                    <span className="font-semibold text-white">{currentSentenceIdx + 1}</span>
                    <span>/</span>
                    <span>{totalSentences}</span>
                </div>

                <div className="h-4 w-px bg-white/15" />

                {/* 倍速切换 */}
                <div className="flex items-center gap-1">
                    {RATES.map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => onChangeRate(r)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                                playbackRate === r
                                    ? 'bg-white/20 text-white'
                                    : 'text-white/40 hover:text-white/80'
                            }`}
                        >
                            {r}x
                        </button>
                    ))}
                </div>
            </div>
            <style jsx>{`
                @media (min-width: 640px) {
                    .reader-audio-bar[data-drawer-open='true'] {
                        right: var(--reader-drawer-width);
                    }
                }
            `}</style>
        </div>
    );
}
