'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 零 UI 纪律：监听鼠标/触摸/按键活动，活动后 3.2s 无操作即隐藏控件层。
 *
 * 性能纪律（修复鼠标卡顿）：
 * - mousemove 高频触发（可达 125Hz+），绝不在事件回调里无条件 setState；
 * - 仅在「可见性真正发生变化」时才 setState，其余时候只重置定时器；
 * - mousemove 用 rAF 节流，每帧最多处理一次。
 */
export function useIdleControls(idleMs = 3200) {
    const [controlsVisible, setControlsVisible] = useState(true);
    const visibleRef = useRef(true);
    const timerRef = useRef(0);
    const rafRef = useRef(0);

    const setVisible = useCallback((v: boolean) => {
        if (visibleRef.current === v) return; // 关键：状态未变化时完全不触发 React 渲染
        visibleRef.current = v;
        setControlsVisible(v);
    }, []);

    const wake = useCallback(() => {
        setVisible(true);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setVisible(false), idleMs);
    }, [idleMs, setVisible]);

    useEffect(() => {
        // rAF 节流版 mousemove 处理器：每帧最多 wake 一次
        const onMouseMove = () => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = 0;
                wake();
            });
        };

        wake();
        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('touchstart', wake, { passive: true });
        window.addEventListener('keydown', wake);
        return () => {
            window.clearTimeout(timerRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('touchstart', wake);
            window.removeEventListener('keydown', wake);
        };
    }, [wake]);

    return controlsVisible;
}
