'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Minimize2 } from 'lucide-react';

interface DraggableContainerProps {
    title: string;
    children: React.ReactNode;
    initialPosition?: { x: number; y: number };
    initialSize?: { width: number; height: number };
    onClose?: () => void;
    className?: string;
    minWidth?: number;
    minHeight?: number;
    headerActions?: React.ReactNode;
}

export default function DraggableContainer({
    title,
    children,
    initialPosition = { x: 20, y: 20 },
    initialSize = { width: 400, height: 600 },
    onClose,
    className = '',
    minWidth = 300,
    minHeight = 200,
    headerActions
}: DraggableContainerProps) {
    const [position, setPosition] = useState(initialPosition);
    const [size, setSize] = useState(initialSize);
    const [isMinimized, setIsMinimized] = useState(false);

    // Drag State
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });

    // Resize State
    const [isResizing, setIsResizing] = useState(false);
    const resizeDirection = useRef<string | null>(null);
    const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

    const containerRef = useRef<HTMLDivElement>(null);

    // --- Dragging Logic ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof Element && (e.target.closest('button') || e.target.closest('.resize-handle'))) return;
        setIsDragging(true);
        dragStartPos.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragStartPos.current.x,
                    y: e.clientY - dragStartPos.current.y
                });
            }

            if (isResizing) {
                const deltaX = e.clientX - resizeStart.current.x;
                const deltaY = e.clientY - resizeStart.current.y;

                let newWidth = resizeStart.current.width;
                let newHeight = resizeStart.current.height;
                let newX = resizeStart.current.posX;
                let newY = resizeStart.current.posY;

                if (resizeDirection.current?.includes('e')) {
                    newWidth = Math.max(minWidth, resizeStart.current.width + deltaX);
                }
                if (resizeDirection.current?.includes('s')) {
                    newHeight = Math.max(minHeight, resizeStart.current.height + deltaY);
                }
                if (resizeDirection.current?.includes('w')) {
                    const possibleWidth = resizeStart.current.width - deltaX;
                    if (possibleWidth >= minWidth) {
                        newWidth = possibleWidth;
                        newX = resizeStart.current.posX + deltaX;
                    }
                }
                if (resizeDirection.current?.includes('n')) {
                    const possibleHeight = resizeStart.current.height - deltaY;
                    if (possibleHeight >= minHeight) {
                        newHeight = possibleHeight;
                        newY = resizeStart.current.posY + deltaY;
                    }
                }

                setSize({ width: newWidth, height: newHeight });
                setPosition({ x: newX, y: newY });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
            resizeDirection.current = null;
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, minWidth, minHeight]);

    // --- Resize Logic ---
    const startResize = (e: React.MouseEvent, direction: string) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(true);
        resizeDirection.current = direction;
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height,
            posX: position.x,
            posY: position.y
        };
    };

    const toggleMinimize = () => setIsMinimized(!isMinimized);

    if (isMinimized) {
        return (
            <div
                className="fixed z-50 bg-black/40 backdrop-blur-xl border border-white/20 rounded-2xl p-3 cursor-pointer hover:bg-white/10 transition-all shadow-2xl flex items-center gap-3 group"
                style={{ left: position.x, top: position.y }}
                onMouseDown={handleMouseDown}
                onClick={(e) => {
                    // Only toggle if not dragging
                    if (!isDragging) {
                        toggleMinimize();
                    }
                }}
            >
                <div className="w-3 h-3 rounded-full bg-yellow-500/80 group-hover:bg-yellow-500 shadow-inner" />
                <span className="text-sm font-medium text-white/90 shadow-black/50 drop-shadow-md">{title}</span>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={`fixed z-40 flex flex-col rounded-2xl shadow-2xl overflow-hidden transition-shadow duration-300 ${className}`}
            style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: size.height,
                // Apple-like Glassmorphism
                backgroundColor: 'rgba(20, 20, 20, 0.25)', // Increased transparency
                backdropFilter: 'blur(20px) saturate(180%)', // Slightly reduced blur for clearer background visibility
                border: '1px solid rgba(255, 255, 255, 0.08)', // More subtle border
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' // Deep shadow
            }}
        >
            {/* Header Bar */}
            <div
                className="h-12 flex items-center justify-between px-4 cursor-move select-none border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    {headerActions && (
                        <div className="mr-2 flex items-center" onMouseDown={(e) => e.stopPropagation()}>
                            {headerActions}
                        </div>
                    )}
                    <span className="text-sm font-semibold text-white/90 tracking-wide drop-shadow-md">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={toggleMinimize} className="p-1.5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors" title="Minimize">
                        <Minimize2 size={14} />
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="p-1.5 hover:bg-red-500/20 rounded-full text-white/60 hover:text-red-400 transition-colors" title="Close">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {children}
            </div>

            {/* Resize Handles */}
            <div className="resize-handle absolute top-0 left-0 w-full h-1 cursor-n-resize hover:bg-blue-400/50 z-50" onMouseDown={(e) => startResize(e, 'n')} />
            <div className="resize-handle absolute bottom-0 left-0 w-full h-1 cursor-s-resize hover:bg-blue-400/50 z-50" onMouseDown={(e) => startResize(e, 's')} />
            <div className="resize-handle absolute top-0 left-0 h-full w-1 cursor-w-resize hover:bg-blue-400/50 z-50" onMouseDown={(e) => startResize(e, 'w')} />
            <div className="resize-handle absolute top-0 right-0 h-full w-1 cursor-e-resize hover:bg-blue-400/50 z-50" onMouseDown={(e) => startResize(e, 'e')} />

            {/* Corner Handles */}
            <div className="resize-handle absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-50" onMouseDown={(e) => startResize(e, 'nw')} />
            <div className="resize-handle absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-50" onMouseDown={(e) => startResize(e, 'ne')} />
            <div className="resize-handle absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-50" onMouseDown={(e) => startResize(e, 'sw')} />
            <div className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-blue-400/50 z-50 rounded-br-2xl" onMouseDown={(e) => startResize(e, 'se')} />
        </div>
    );
}
