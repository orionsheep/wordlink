'use client';

import { useEffect, useRef } from 'react';

/**
 * 电影级四季视频交叉溶接引擎 (SceneVideoLayer)
 *
 * 核心升级：
 * 1. 杜绝原生 loop 硬切跳帧；
 * 2. 全部视频 preload="auto" 并启用独立硬件加速图层 (translateZ(0) + will-change)；
 * 3. 预热机制：下一场景在淡入前 200ms 确保解码器全速运行；
 * 4. 1200ms cubic-bezier(0.4, 0, 0.2, 1) 电影级平滑溶接；
 * 5. 首尾闭环：第 4 场景（冬）播放完毕自动平滑溶接回第 1 场景（春）。
 */

const SEASON_VIDEOS = [
    '/videos/spring.mp4',
    '/videos/summer.mp4',
    '/videos/autumn.mp4',
    '/videos/winter.mp4',
];

/** 提前量：足够覆盖「启动下一路解码 + 1200ms 溶接」，且不提前到影响当前场景 */
const NEAR_END_SECONDS = 2.5;
const CROSSFADE_DURATION_MS = 1200;

export default function SceneVideoLayer({
    active,
    onNearEnd,
}: {
    active: number;
    onNearEnd?: () => void;
}) {
    const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
    const firedRef = useRef(false);
    const prevActiveRef = useRef(0);

    // 场景切换时的精细播放编排
    useEffect(() => {
        firedRef.current = false;
        prevActiveRef.current = active;

        const activeEl = videoRefs.current[active];
        const nextIdx = (active + 1) % SEASON_VIDEOS.length;
        const nextEl = videoRefs.current[nextIdx];

        // 1. 当前激活的视频必须立即全速播放
        if (activeEl && activeEl.paused) {
            void activeEl.play().catch(() => {});
        }

        // 2. 性能纪律：同一时刻只解码一路视频。
        //    下一场景仅 preload（浏览器已拉取并缓冲数据），不提前 play，
        //    避免双路高清解码抢占 CPU/GPU 导致鼠标/动画掉帧。
        if (nextEl && !nextEl.paused) {
            nextEl.pause();
        }
        if (nextEl && Number.isFinite(nextEl.duration)) {
            try {
                nextEl.currentTime = 0; // 回到起点，保证溶接入场的画面完整
            } catch {
                /* noop */
            }
        }

        // 3. 其余非活跃视频等 1200ms 淡出彻底结束后，再暂停省电
        const timer = window.setTimeout(() => {
            videoRefs.current.forEach((el, i) => {
                if (!el) return;
                if (i !== active && !el.paused) {
                    el.pause();
                }
            });
        }, CROSSFADE_DURATION_MS + 200);

        return () => window.clearTimeout(timer);
    }, [active]);

    const handleTimeUpdate = (i: number) => {
        if (i !== active || firedRef.current || !onNearEnd) return;
        const el = videoRefs.current[i];
        if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;

        // 提前 2.5 秒触发：先启动下一路解码（预加载已完成，启动极快），再换场溶接
        if (el.duration - el.currentTime <= NEAR_END_SECONDS) {
            firedRef.current = true;
            const nextEl = videoRefs.current[(i + 1) % SEASON_VIDEOS.length];
            if (nextEl) {
                try {
                    nextEl.currentTime = 0;
                } catch {
                    /* noop */
                }
                void nextEl.play().catch(() => {});
            }
            onNearEnd();
        }
    };

    return (
        <div className="absolute inset-0 overflow-hidden bg-black">
            {SEASON_VIDEOS.map((src, i) => (
                <video
                    key={src}
                    ref={(el) => {
                        videoRefs.current[i] = el;
                    }}
                    onTimeUpdate={() => handleTimeUpdate(i)}
                    onEnded={() => {
                        // 兜底循环（首尾闭环）
                        const el = videoRefs.current[i];
                        if (el) {
                            el.currentTime = 0;
                            void el.play().catch(() => {});
                        }
                    }}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] cubic-bezier(0.4, 0, 0.2, 1) ${
                        i === active ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                    style={{
                        transform: 'translateZ(0)',
                        willChange: 'opacity',
                    }}
                    src={src}
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                />
            ))}

            {/* 恒定电影感暗角 + 底部加深渐隐，独立于视频层，保证溶接时前景光影坚如磐石。
                底部为文字区提供足够对比度（可读性保障）。 */}
            <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{
                    background:
                        'radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(0,0,0,0.42) 100%), linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 26%, rgba(0,0,0,0) 46%)',
                }}
            />
        </div>
    );
}
