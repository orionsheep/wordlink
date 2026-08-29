'use client';

import { useEffect, useRef, useState } from 'react';

export const ROTATING_COSMIC_VIDEOS = [
    {
        id: 'violet_nebula',
        name: '🌌 紫青星系',
        fullName: '🌌 紫青旋涡星系 · Deep Violet Nebula',
        src: '/videos/veo3-seamless-loop.mp4',
    },
    {
        id: 'blackhole_lensing',
        name: '🌑 黑洞视界',
        fullName: '🌑 视界引力黑洞 · Black Hole Accretion Disk',
        src: '/videos/veo3-blackhole-seamless.mp4',
    },
];

const CYCLE_DURATION_MS = 14000; // 每 14 秒自动平滑溶接切换

export default function CosmicRotatingBackground({
    onIndexChange,
}: {
    onIndexChange?: (idx: number) => void;
}) {
    const [activeIdx, setActiveIdx] = useState(0);
    const videoRefA = useRef<HTMLVideoElement | null>(null);
    const videoRefB = useRef<HTMLVideoElement | null>(null);

    // 自动轮播定时器
    useEffect(() => {
        const timer = setInterval(() => {
            setActiveIdx((prev) => {
                const next = (prev + 1) % ROTATING_COSMIC_VIDEOS.length;
                onIndexChange?.(next);
                return next;
            });
        }, CYCLE_DURATION_MS);

        return () => clearInterval(timer);
    }, [onIndexChange]);

    // 切换时确保当前激活的视频正在播放
    useEffect(() => {
        const activeVideoEl = activeIdx === 0 ? videoRefA.current : videoRefB.current;
        const inactiveVideoEl = activeIdx === 0 ? videoRefB.current : videoRefA.current;

        if (activeVideoEl && activeVideoEl.paused) {
            void activeVideoEl.play().catch(() => {});
        }

        // 延迟等淡出彻底完成后暂停非活跃视频省电
        const pauseTimer = setTimeout(() => {
            if (inactiveVideoEl && !inactiveVideoEl.paused) {
                // Keep playing or looping quietly
            }
        }, 1600);

        return () => clearTimeout(pauseTimer);
    }, [activeIdx]);

    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-black">
            {/* 视频 1: 紫青旋涡星系 */}
            <video
                ref={videoRefA}
                src={ROTATING_COSMIC_VIDEOS[0].src}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className={`absolute inset-0 w-full h-full object-cover scale-105 transition-opacity duration-[1500ms] ease-in-out ${
                    activeIdx === 0 ? 'opacity-45 z-[1]' : 'opacity-0 z-0'
                }`}
                style={{ transform: 'translateZ(0)', willChange: 'opacity' }}
            />

            {/* 视频 2: 黑洞引力透镜 */}
            <video
                ref={videoRefB}
                src={ROTATING_COSMIC_VIDEOS[1].src}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className={`absolute inset-0 w-full h-full object-cover scale-105 transition-opacity duration-[1500ms] ease-in-out ${
                    activeIdx === 1 ? 'opacity-45 z-[1]' : 'opacity-0 z-0'
                }`}
                style={{ transform: 'translateZ(0)', willChange: 'opacity' }}
            />

            {/* 动态暗黑遮罩：保证全站所有文字和玻璃组件具备最高对比度 */}
            <div
                className="absolute inset-0 z-[2]"
                style={{
                    background:
                        'radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.60) 50%, rgba(0,0,0,0.92) 100%)',
                }}
            />
            {/* 顶部与底部呼吸渐变 */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent z-[3]" />
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/80 to-transparent z-[3]" />
        </div>
    );
}
