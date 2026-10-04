'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject, Ref } from 'react';

interface LazyVideoProps {
    src: string;
    poster?: string;
    autoPlay?: boolean;
    muted?: boolean;
    loop?: boolean;
    playsInline?: boolean;
    /** 激活（进入视口）后生效的 preload 策略；占位阶段强制 'none' */
    preload?: 'auto' | 'metadata' | 'none';
    className?: string;
    style?: CSSProperties;
    /** 距视口多远开始加载，默认 '300px 0px' */
    rootMargin?: string;
    /** 离开视口自动暂停、回到视口且 autoPlay 时恢复播放，默认 true */
    pauseWhenHidden?: boolean;
    ref?: Ref<HTMLVideoElement>;
}

/**
 * 视口懒加载 <video>。
 * 进入视口（含 rootMargin 提前量）前只渲染占位、不挂 src、不消耗带宽；
 * 命中后才挂 src 交浏览器拉流，autoPlay 场景自动开始播放；
 * 离开视口自动暂停，回到视口且 autoPlay 时恢复。
 * SSR 安全：服务端与客户端首帧输出一致（均无 src），无 hydration 差异。
 */
export default function LazyVideo({
    src,
    poster,
    autoPlay,
    muted,
    loop,
    playsInline,
    preload = 'auto',
    className,
    style,
    rootMargin = '300px 0px',
    pauseWhenHidden = true,
    ref,
}: LazyVideoProps) {
    const [loaded, setLoaded] = useState(false);
    const inViewRef = useRef(false);
    const innerRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        if (typeof IntersectionObserver === 'undefined') {
            // 无 IO 的环境直接加载，保证可用性兜底
            inViewRef.current = true;
            setLoaded(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        inViewRef.current = true;
                        setLoaded(true);
                    } else {
                        inViewRef.current = false;
                        if (pauseWhenHidden) innerRef.current?.pause();
                    }
                }
            },
            { rootMargin },
        );
        io.observe(el);
        return () => io.disconnect();
        // 仅在挂载时建立观察；props 视为静态
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // src 挂上后若正处于视口内且要求自动播放，补一次 play()（IO 回调与 setState 提交存在时序差）
    useEffect(() => {
        if (loaded && autoPlay && inViewRef.current) {
            void innerRef.current?.play().catch(() => {});
        }
    }, [loaded, autoPlay]);

    return (
        <video
            ref={(el) => {
                innerRef.current = el;
                if (typeof ref === 'function') ref(el);
                else if (ref) (ref as MutableRefObject<HTMLVideoElement | null>).current = el;
            }}
            src={loaded ? src : undefined}
            poster={poster}
            autoPlay={loaded ? autoPlay : false}
            muted={muted}
            loop={loop}
            playsInline={playsInline}
            preload={loaded ? preload : 'none'}
            className={className}
            style={style}
        />
    );
}
