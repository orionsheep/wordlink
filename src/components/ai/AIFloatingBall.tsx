'use client';

import { useRef, useEffect, useLayoutEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useAI } from './AIProvider';
import { Sparkles } from 'lucide-react';

export default function AIFloatingBall() {
    const { aiEnabled } = useSettings();
    const { isOpen, setIsOpen, setBallPosition } = useAI();

    const ballRef = useRef<HTMLButtonElement>(null);
    const posRef = useRef({ x: -1, y: -1 });
    const dragState = useRef({ isDragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0, moved: false });
    const initialized = useRef(false);

    // Load position from localStorage on mount
    useLayoutEffect(() => {
        if (typeof window === 'undefined' || initialized.current) return;
        initialized.current = true;

        const saved = localStorage.getItem('ai-ball-position');
        if (saved) {
            try {
                const pos = JSON.parse(saved);
                posRef.current = {
                    x: Math.max(0, Math.min(window.innerWidth - 56, pos.x)),
                    y: Math.max(0, Math.min(window.innerHeight - 56, pos.y)),
                };
            } catch {
                posRef.current = {
                    x: window.innerWidth - 80,
                    y: window.innerHeight - 80,
                };
            }
        } else {
            posRef.current = {
                x: window.innerWidth - 80,
                y: window.innerHeight - 80,
            };
        }

        // Also update the context
        setBallPosition(posRef.current);

        if (ballRef.current) {
            ballRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
        }
    }, [setBallPosition]);

    // Update position when becoming visible
    useEffect(() => {
        if (!isOpen && ballRef.current && posRef.current.x >= 0) {
            ballRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
        }
    }, [isOpen]);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        dragState.current = {
            isDragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startPosX: posRef.current.x,
            startPosY: posRef.current.y,
            moved: false,
        };
        ballRef.current?.setPointerCapture(e.pointerId);
        if (ballRef.current) {
            ballRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0) scale(1.1)`;
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragState.current.isDragging) return;

        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            dragState.current.moved = true;
        }

        const newX = Math.max(0, Math.min(window.innerWidth - 56, dragState.current.startPosX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - 56, dragState.current.startPosY + dy));

        posRef.current = { x: newX, y: newY };

        // Direct DOM update for instant response
        if (ballRef.current) {
            ballRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0) scale(1.1)`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        const wasDragging = dragState.current.isDragging;
        const wasMoved = dragState.current.moved;

        dragState.current.isDragging = false;
        ballRef.current?.releasePointerCapture(e.pointerId);

        if (ballRef.current) {
            ballRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0) scale(1)`;
        }

        // Save to localStorage and update context
        if (wasMoved) {
            localStorage.setItem('ai-ball-position', JSON.stringify(posRef.current));
            setBallPosition(posRef.current);
        }

        // Toggle only if not dragged
        if (wasDragging && !wasMoved) {
            // Update ball position in context before opening
            setBallPosition(posRef.current);
            setIsOpen(true);
        }
    };

    // Instead of unmounting, we fade out to ensure smooth transition
    // if (!aiEnabled || isOpen) return null; 
    if (!aiEnabled) return null;

    return (
        <button
            ref={ballRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="fixed z-40 w-14 h-14 rounded-full flex items-center justify-center select-none touch-none will-change-transform transition-opacity duration-300"
            style={{
                left: 0,
                top: 0,
                transform: `translate3d(${posRef.current.x >= 0 ? posRef.current.x : window?.innerWidth - 80 || 0}px, ${posRef.current.y >= 0 ? posRef.current.y : window?.innerHeight - 80 || 0}px, 0)`,
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(59, 130, 246, 0.9))',
                // Add delay for opacity transition to allow window to cover ball before ball disappears
                // When opening (isOpen=true), delay hiding (opacity 0) by 50ms
                // When closing (isOpen=false), show immediately (opacity 1) but with transition
                transition: 'opacity 300ms ease-out',
                transitionDelay: isOpen ? '50ms' : '0ms',
                opacity: isOpen ? 0 : 1,
                pointerEvents: isOpen ? 'none' : 'auto',
            }}
            title="打开 AI 助手 (可拖动)"
        >
            <Sparkles size={24} className="text-white animate-pulse" />
            <span className="absolute inset-0 rounded-full animate-ping bg-gradient-to-r from-purple-500/40 to-blue-500/40" style={{ animationDuration: '2s' }} />
        </button>
    );
}
