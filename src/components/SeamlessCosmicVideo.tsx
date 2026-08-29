'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ⚡ 无缝无限循环星际视频引擎 (Seamless Cosmic Video Engine)
 *
 * 核心原理（杜绝任何循环跳帧与卡顿）：
 * 1. 采用 A/B 双轨交叉缓冲溶接机制；
 * 2. 轨道 A 播放至倒数 1.5s 时，轨道 B 提前启动播放并以 1200ms cubic-bezier 平滑淡入；
 * 3. 轨道 B 临近结尾时，轨道 A 再次启动并平滑接力；
 * 4. 搭配 ffmpeg 首尾对齐的 veo3-seamless-loop.mp4，实现 100% 感受不到循环点的真实连续无限深空漫游。
 */
export default function SeamlessCosmicVideo({
    src = '/videos/veo3-seamless-loop.mp4',
    className = 'absolute inset-0 w-full h-full object-cover',
}: {
    src?: string;
    className?: string;
}) {
    const videoRefA = useRef<HTMLVideoElement | null>(null);
    const videoRefB = useRef<HTMLVideoElement | null>(null);

    // activeTrack: 'A' | 'B'
    const [activeTrack, setActiveTrack] = useState<'A' | 'B'>('A');
    const firedRef = useRef(false);

    useEffect(() => {
        const vA = videoRefA.current;
        const vB = videoRefB.current;
        if (vA) {
            vA.currentTime = 0;
            void vA.play().catch(() => {});
        }
        if (vB) {
            vB.currentTime = 0;
            vB.pause();
        }
    }, [src]);

    const handleTimeUpdateA = () => {
        if (activeTrack !== 'A' || firedRef.current) return;
        const vA = videoRefA.current;
        const vB = videoRefB.current;
        if (!vA || !Number.isFinite(vA.duration) || vA.duration <= 0) return;

        // 提前 1.4 秒启动轨道 B 播放并接力
        if (vA.duration - vA.currentTime <= 1.4) {
            firedRef.current = true;
            if (vB) {
                vB.currentTime = 0;
                void vB.play().catch(() => {});
            }
            setActiveTrack('B');
            setTimeout(() => {
                firedRef.current = false;
            }, 1000);
        }
    };

    const handleTimeUpdateB = () => {
        if (activeTrack !== 'B' || firedRef.current) return;
        const vA = videoRefA.current;
        const vB = videoRefB.current;
        if (!vB || !Number.isFinite(vB.duration) || vB.duration <= 0) return;

        // 提前 1.4 秒启动轨道 A 播放并接力
        if (vB.duration - vB.currentTime <= 1.4) {
            firedRef.current = true;
            if (vA) {
                vA.currentTime = 0;
                void vA.play().catch(() => {});
            }
            setActiveTrack('A');
            setTimeout(() => {
                firedRef.current = false;
            }, 1000);
        }
    };

    return (
        <div className="absolute inset-0 overflow-hidden bg-black pointer-events-none">
            {/* 轨道 A */}
            <video
                ref={videoRefA}
                src={src}
                autoPlay
                muted
                playsInline
                preload="auto"
                onTimeUpdate={handleTimeUpdateA}
                className={`${className} transition-opacity duration-[1200ms] ease-in-out ${
                    activeTrack === 'A' ? 'opacity-45 z-[1]' : 'opacity-0 z-0'
                }`}
                style={{ transform: 'translateZ(0)', willChange: 'opacity' }}
            />

            {/* 轨道 B */}
            <video
                ref={videoRefB}
                src={src}
                muted
                playsInline
                preload="auto"
                onTimeUpdate={handleTimeUpdateB}
                className={`${className} transition-opacity duration-[1200ms] ease-in-out ${
                    activeTrack === 'B' ? 'opacity-45 z-[1]' : 'opacity-0 z-0'
                }`}
                style={{ transform: 'translateZ(0)', willChange: 'opacity' }}
            />
        </div>
    );
}
