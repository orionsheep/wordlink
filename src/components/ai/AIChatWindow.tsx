'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, ChevronDown, Loader2, Minus, GripVertical, Square, Plus, MessageSquare, BookOpen, FolderOpen, Trash2, PanelLeftClose, PanelLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAI } from './AIProvider';
import { useSettings } from '@/context/SettingsContext';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface LocalSession {
    id: string;
    title: string;
    category: number;
    word?: string;
    wordGroup?: string;
    messages: Message[];
    createdAt: Date;
}

const MODELS = [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', description: '快速高效' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: '复杂推理' },
];

const CATEGORY_STYLES: Record<number, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
    1: { icon: <BookOpen size={14} />, label: '单词', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    2: { icon: <FolderOpen size={14} />, label: '单词组', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    3: { icon: <Sparkles size={14} />, label: '全局调用', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
    4: { icon: <MessageSquare size={14} />, label: '其他', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
};

const MIN_WIDTH = 480;
const MIN_HEIGHT = 500;

const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

export default function AIChatWindow() {
    const { isOpen, setIsOpen, userContext, currentWord, setCurrentWord, ballPosition, currentWordGroup } = useAI();
    const { aiDefaultModel } = useSettings();

    // Local session state
    const [sessions, setSessions] = useState<LocalSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const currentSessionIdRef = useRef<string | null>(null);
    useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

    const [showSidebar, setShowSidebar] = useState(true);

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState(aiDefaultModel || 'deepseek-chat');
    const [showModelSelect, setShowModelSelect] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [showModeSelect, setShowModeSelect] = useState(false);

    // Animation phases: closed -> opening -> open -> closing -> closed
    const [animState, setAnimState] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed');

    const abortControllerRef = useRef<AbortController | null>(null);

    // Window State
    const [position, setPosition] = useState({ x: -1, y: -1 });
    const [size, setSize] = useState({ width: 520, height: 600 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
    const lastWordRef = useRef<string | null>(null);
    const lastWordGroupRef = useRef<string | null>(null);

    // Current session
    const currentSession = sessions.find(s => s.id === currentSessionId);
    const messages = currentSession?.messages || [];

    // --- State Management ---

    // Load sessions from server
    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/ai/sessions', {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(data.map((s: any) => ({
                    ...s,
                    messages: s.messages || [],
                    createdAt: new Date(s.createdAt)
                })));
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchSessions();
        }
    }, [isOpen]);

    // Load window position (keep in localStorage as it is UI state)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (position.x !== -1) return;

        const saved = localStorage.getItem('ai-window-state');
        let loadedPos = { x: window.innerWidth - 520 - 80, y: window.innerHeight - 600 - 80 };
        let loadedSize = { width: 520, height: 600 };

        if (saved) {
            try {
                const { pos, sz } = JSON.parse(saved);
                if (sz?.width && sz?.height) loadedSize = sz;
                if (pos?.x !== undefined && pos?.y !== undefined) {
                    loadedPos = {
                        x: Math.max(0, Math.min(window.innerWidth - loadedSize.width, pos.x)),
                        y: Math.max(0, Math.min(window.innerHeight - loadedSize.height, pos.y)),
                    };
                }
            } catch { }
        }
        setSize(loadedSize);
        setPosition(loadedPos);
    }, [position.x]);

    // Save window state
    useEffect(() => {
        if (position.x >= 0 && typeof window !== 'undefined') {
            localStorage.setItem('ai-window-state', JSON.stringify({ pos: position, sz: size }));
        }
    }, [position, size]);

    // --- Animation Logic ---

    // Correctly handle state transitions including initial render
    useEffect(() => {
        if (isOpen && (animState === 'closed' || animState === 'closing')) {
            // Force immediate layout calc if needed, though React state update is next frame
            setAnimState('opening');
            // Trigger animation to 'open' in next frame
            requestAnimationFrame(() => {
                setAnimState('open');
            });
        }
        // ... (closing logic handled by handleClose)
    }, [isOpen]);

    // Internal close handler
    const handleClose = useCallback(() => {
        setAnimState('closing');
        setTimeout(() => {
            setAnimState('closed');
            setIsOpen(false);
        }, 400);
    }, [setIsOpen]);

    // Auto-create/switch session
    useEffect(() => {
        if (!isOpen) return;
        if (currentWord && currentWord !== lastWordRef.current) {
            lastWordRef.current = currentWord;
            const existingSession = sessions.find(s => s.category === 1 && s.word === currentWord);
            if (existingSession) setCurrentSessionId(existingSession.id);
            else createLocalSession(1, currentWord);
        } else if (currentWordGroup && currentWordGroup !== lastWordGroupRef.current) {
            lastWordGroupRef.current = currentWordGroup;
            const existingSession = sessions.find(s => s.category === 2 && s.wordGroup === currentWordGroup);
            if (existingSession) setCurrentSessionId(existingSession.id);
            else createLocalSession(2, undefined, currentWordGroup);
        } else if (!currentSessionId && sessions.length === 0) {
            createLocalSession(3);
        } else if (!currentSessionId && sessions.length > 0) {
            setCurrentSessionId(sessions[0].id);
        }
    }, [isOpen, currentWord, currentWordGroup, sessions.length]);

    // --- Helper Functions ---
    const getGreeting = (category: number, contextData?: string) => {
        const contextInfo = userContext && (userContext.recentHistory?.length > 0 || userContext.recentTests?.length > 0)
            ? `\n\n📊 我已获取你的学习数据 (${userContext.recentHistory?.length || 0}条浏览记录, ${userContext.recentTests?.length || 0}条测试记录)`
            : '';

        if (category === 1 && contextData) {
            return `👋 我们来学习单词 **${contextData}**！\n\n我可以帮你：\n- 解释含义和用法\n- 提供例句和记忆技巧\n- 比较相似词汇${contextInfo}\n\n有什么想了解的？`;
        }

        if (category === 3) {
            return `👋 全局调用模式已激活！${contextInfo}\n\n我可以：\n- 分析你的整体学习情况\n- 找出薄弱环节\n- 提供个性化学习建议\n- 回答任何学习相关问题\n\n有什么想了解的吗？`;
        }

        if (category === 2 && contextData) {
            const count = contextData.split(',').length;
            return `👋 我准备好帮你复习这 **${count}** 个单词了！\n\n我可以：\n- 解释它们之间的联系\n- 提供包含这些词的串记例句\n- 分析你对这些词的掌握情况\n\n我们开始吧？`;
        }

        return `👋 你好！我是你的英语学习助手。\n\n我可以帮助你：\n- 解释单词含义和用法\n- 提供例句和记忆技巧\n- 分析你的学习进度${contextInfo}\n\n有什么我可以帮你的吗？`;
    };

    const createLocalSession = async (category: number = 4, word?: string, wordGroup?: string) => {
        const id = generateId();
        let title = '新对话';
        if (category === 1 && word) title = `单词: ${word}`;
        if (category === 2 && wordGroup) title = '单词组学习';
        if (category === 3) title = '全局调用';

        const initialMessage = { role: 'assistant', content: getGreeting(category, category === 1 ? word : wordGroup) } as Message;

        const newSession: LocalSession = {
            id,
            title,
            category,
            word,
            wordGroup,
            messages: [initialMessage],
            createdAt: new Date(),
        };
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(id);
        return id;
    };

    const deleteLocalSession = async (sessionId: string) => {
        // Optimistic delete
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (currentSessionId === sessionId) {
            const remaining = sessions.filter(s => s.id !== sessionId);
            setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
        }

        try {
            await fetch(`/api/ai/sessions/${sessionId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Failed to delete session:', error);
            // Could revert here if needed, but keeping it simple
        }
    };

    const updateSessionMessages = (sessionId: string, newMessages: Message[]) => {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: newMessages } : s));
    };


    // Close without stopping generation
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;
        const newMessage = input.trim();
        let sessionId = currentSessionId;

        // Auto-create local session if needed
        if (!sessionId) {
            const category = currentWord ? 1 : 3;
            sessionId = await createLocalSession(category, currentWord || undefined);
        }

        // Add user message locally
        const currentMsgs = sessions.find(s => s.id === sessionId)?.messages || [];
        const newMessages: Message[] = [...currentMsgs, { role: 'user', content: newMessage }];
        updateSessionMessages(sessionId!, newMessages);
        setInput('');
        setIsLoading(true);
        setIsLoading(true);
        if (currentSessionIdRef.current === sessionId) setStreamingContent('');
        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentMsgs, // Send history (without new message)
                    newMessage, // Send new message explicitly
                    model: selectedModel,
                    word: currentSession?.word || currentWord,
                    wordGroup: currentSession?.wordGroup || currentWordGroup,
                    category: currentSession?.category || 4,
                    sessionId, // Send current ID (backend will check validity)
                    userContext,
                }),
                signal: abortControllerRef.current.signal,
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to get response');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);

                                // Protocol: Session Update
                                if (parsed.type === 'session' && parsed.id) {
                                    const oldId = sessionId;
                                    const newId = parsed.id;
                                    if (oldId !== newId) {
                                        // Update session ID in state
                                        setSessions(prev => prev.map(s => s.id === oldId ? { ...s, id: newId } : s));
                                        setCurrentSessionId(newId);
                                        sessionId = newId; // Update local ref
                                    }
                                }

                                // Protocol: Content Delta
                                if (parsed.type === 'text' && parsed.content) {
                                    fullContent += parsed.content;
                                    // Only update UI if this is the active session
                                    if (currentSessionIdRef.current === sessionId) {
                                        setStreamingContent(fullContent);
                                    }
                                }
                            } catch { }
                        }
                    }
                }
            }
            const finalContent = fullContent || '抱歉，无法生成回复。';
            const finalMessages: Message[] = [...newMessages, { role: 'assistant', content: finalContent }];
            updateSessionMessages(sessionId!, finalMessages);
            if (currentSessionIdRef.current === sessionId) setStreamingContent('');

        } catch (error: any) {
            if (error.name === 'AbortError') return;
            const errorMessages: Message[] = [...newMessages, { role: 'assistant', content: '❌ 连接失败，请重试。' }];
            updateSessionMessages(sessionId!, errorMessages);
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };

    const stopGeneration = () => { abortControllerRef.current?.abort(); setIsLoading(false); setStreamingContent(''); };

    // --- Draggable Logic ---
    const dragOffset = useRef({ x: 0, y: 0 }); // Offset from corner of window

    const handleHeaderPointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('.no-drag')) return;
        e.preventDefault();
        setIsDragging(true);
        // Calculate offset from the top-left of the window
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleHeaderPointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !containerRef.current) return;

        // Calculate new raw position
        let newX = e.clientX - dragOffset.current.x;
        let newY = e.clientY - dragOffset.current.y;

        // Boundary checks (keep window somewhat on screen)
        // Allow some overhang but keep header visible
        newX = Math.max(-size.width + 50, Math.min(window.innerWidth - 50, newX));
        newY = Math.max(0, Math.min(window.innerHeight - 50, newY));

        // Direct DOM update for performance (no React render)
        // We use transform for smoothest performance during drag, keeping left/top fixed
        // But wait, our 'position' state controls left/top.
        // If we only update transform, we need to update left/top on release.
        // Actually, updating style.left/top directly is fine if we don't setState.

        containerRef.current.style.left = `${newX}px`;
        containerRef.current.style.top = `${newY}px`;

        // Store temp pos for state update on release
        dragStart.current = { x: 0, y: 0, posX: newX, posY: newY };
    };

    const handleHeaderPointerUp = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setIsDragging(false);
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

        // Sync final position to state
        // Use the last known DOM position if available, or calculate
        const currentLeft = parseFloat(containerRef.current?.style.left || '0');
        const currentTop = parseFloat(containerRef.current?.style.top || '0');

        // Update state to persist the position
        setPosition({ x: currentLeft, y: currentTop });
    };

    // --- Resize Logic ---
    const handleResizeStart = (direction: string) => (e: React.MouseEvent) => { e.preventDefault(); setIsResizing(direction); };
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        let newWidth = size.width, newHeight = size.height, newX = position.x, newY = position.y;
        if (isResizing.includes('e')) newWidth = Math.max(MIN_WIDTH, e.clientX - position.x);
        if (isResizing.includes('w')) { const d = position.x - e.clientX; newWidth = Math.max(MIN_WIDTH, size.width + d); if (newWidth > MIN_WIDTH) newX = e.clientX; }
        if (isResizing.includes('s')) newHeight = Math.max(MIN_HEIGHT, e.clientY - position.y);
        if (isResizing.includes('n')) { const d = position.y - e.clientY; newHeight = Math.max(MIN_HEIGHT, size.height + d); if (newHeight > MIN_HEIGHT) newY = e.clientY; }
        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: newX, y: newY });
    }, [isResizing, position, size]);
    const handleMouseUp = useCallback(() => setIsResizing(null), []);
    useEffect(() => {
        if (isResizing) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }; }
    }, [isResizing, handleMouseMove, handleMouseUp]);

    useEffect(() => { if (aiDefaultModel) setSelectedModel(aiDefaultModel); }, [aiDefaultModel]);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingContent]);
    useEffect(() => { if (animState === 'open') inputRef.current?.focus(); }, [animState]);

    // Force effective state to 'opening' if isOpen is true but state is closed
    // This is crucial for avoiding the 1-frame flicker where component renders null
    const effectiveAnimState = (isOpen && animState === 'closed') ? 'opening' : animState;

    // Don't render if completely closed
    if (!isOpen && effectiveAnimState === 'closed') return null;

    // --- Compute Morphing Animation ---

    const isAnimating = effectiveAnimState === 'opening' || effectiveAnimState === 'closing';

    // Initial/Closed state: The ball
    const ballPos = ballPosition.x >= 0 ? ballPosition : { x: window?.innerWidth - 80 || 0, y: window?.innerHeight - 80 || 0 };
    const initialStyles = {
        left: ballPos.x,
        top: ballPos.y,
        width: 56,
        height: 56,
        borderRadius: '50%',
        opacity: 1,
        transform: 'scale(1)',
    };

    const targetStyles = {
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        borderRadius: '1.5rem',
        opacity: 1,
        transform: 'scale(1)',
    };

    // If 'opening', start at initial. If 'closing', start at target (and transition to initial).
    // The trick is: 
    // - opening phase: render at initial, then effect switches to open (target) -> triggers transition
    // - closing phase: render at target(from open), switch to closing -> triggers transition to initial

    // So if state is 'opening', we need to return Initial. 
    // Then state becomes 'open', we return Target. CSS transitions.

    // If state is 'open', we return Target.
    // If state becomes 'closing', we return Initial. CSS transitions.

    const currentStyle = (effectiveAnimState === 'closed' || effectiveAnimState === 'opening' || effectiveAnimState === 'closing')
        ? initialStyles
        : targetStyles;

    // Content Opacity Logic
    // We want content to be visible ONLY when 'open'.
    // During opening: fade in (opacity 0 -> 1)
    // During closing: fade out FAST (opacity 1 -> 0)
    // If we are 'closing', force content opacity to 0 immediately to prevent squashing.
    const isContentVisible = animState === 'open';
    const contentOpacity = isContentVisible ? 'opacity-100' : 'opacity-0';
    // During closing, we want opacity to be 0 immediately/very fast.
    // CSS transition handles the fade.

    return (
        <div
            ref={containerRef}
            className="fixed z-50 flex overflow-hidden shadow-2xl border border-white/20"
            style={{
                ...currentStyle,
                // Liquid glass effect
                background: isAnimating
                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(59, 130, 246, 0.9))'
                    : 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',

                backdropFilter: isAnimating ? 'blur(10px)' : 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: isAnimating ? 'blur(10px)' : 'blur(24px) saturate(180%)',

                boxShadow: isAnimating
                    ? '0 0 20px rgba(139, 92, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.2)'
                    : '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255,255,255,0.1)',

                // Spring animation for window shape/position
                transition: isDragging ? 'none' : 'all 500ms cubic-bezier(0.19, 1, 0.22, 1)',
            }}
        >
            {/* We always render content, and let overflow-hidden clip it during morph */}
            {/* To fade content in/out nicely: */}
            {/* closing: fast fade out (100ms) to clear stage for morph */}
            {/* opening: slight delay (150ms) then fade in (300ms) to let window expand first */}
            <div
                className={`flex-1 flex w-full h-full transition-opacity ${animState === 'open' ? 'opacity-100 duration-300 delay-100' : 'opacity-0 duration-75 delay-0'
                    } ${animState === 'closing' ? 'pointer-events-none' : ''}`}
            >

                {/* Resize handles - only active when open */}
                {animState === 'open' && (
                    <>
                        {['nw', 'ne', 'sw', 'se'].map(d => <div key={d} className={`absolute ${d.includes('n') ? 'top-0' : 'bottom-0'} ${d.includes('w') ? 'left-0' : 'right-0'} w-4 h-4 cursor-${d}-resize z-10`} onMouseDown={handleResizeStart(d)} />)}
                        {['n', 's'].map(d => <div key={d} className={`absolute ${d === 'n' ? 'top-0' : 'bottom-0'} left-4 right-4 h-2 cursor-${d}-resize z-10`} onMouseDown={handleResizeStart(d)} />)}
                        {['w', 'e'].map(d => <div key={d} className={`absolute ${d === 'w' ? 'left-0' : 'right-0'} top-4 bottom-4 w-2 cursor-${d}-resize z-10`} onMouseDown={handleResizeStart(d)} />)}
                    </>
                )}

                {/* Sidebar */}
                {showSidebar && (
                    <div className="w-48 bg-white/5 border-r border-white/10 flex flex-col backdrop-blur-sm min-w-[192px]">
                        <div className="p-3 border-b border-white/10 flex items-center justify-between">
                            <span className="text-white/70 text-sm font-medium">对话</span>
                            <button onClick={() => createLocalSession(3)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title="新对话">
                                <Plus size={16} className="text-white/70" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {sessions.map(session => {
                                const style = CATEGORY_STYLES[session.category] || CATEGORY_STYLES[3];
                                return (
                                    <div key={session.id}
                                        onClick={() => setCurrentSessionId(session.id)}
                                        className={`group p-2 rounded-lg cursor-pointer flex items-center gap-2 transition-all ${currentSessionId === session.id ? `${style.bgColor} ring-1 ring-white/20` : 'hover:bg-white/10'}`}>
                                        <span className={style.color}>{style.icon}</span>
                                        <span className="flex-1 text-sm text-white/80 truncate">{session.title}</span>
                                        <button onClick={(e) => { e.stopPropagation(); deleteLocalSession(session.id); }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded transition-all">
                                            <Trash2 size={12} className="text-white/50" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Main content */}
                <div className="flex-1 flex flex-col bg-gradient-to-b from-transparent to-black/10 min-w-0">
                    {/* Header */}
                    <div className="relative z-10 bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-3 flex items-center justify-between select-none touch-none border-b border-white/10 backdrop-blur-sm"
                        onPointerDown={handleHeaderPointerDown} onPointerMove={handleHeaderPointerMove} onPointerUp={handleHeaderPointerUp}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
                        <div className="flex items-center gap-3 overflow-visible flex-1">
                            <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 hover:bg-white/10 rounded-lg no-drag">
                                {showSidebar ? <PanelLeftClose size={16} className="text-white/70" /> : <PanelLeft size={16} className="text-white/70" />}
                            </button>
                            <GripVertical className="text-white/40 flex-shrink-0" size={14} />
                            <Sparkles className="text-purple-300 flex-shrink-0" size={18} />
                            <div className="overflow-visible flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-white font-semibold text-sm truncate">AI 学习助手</h3>
                                    {/* Mode Switcher */}
                                    <div className="relative no-drag">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowModeSelect(!showModeSelect);
                                            }}
                                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                                        >
                                            {currentSession && CATEGORY_STYLES[currentSession.category] && (
                                                <>
                                                    <span className={CATEGORY_STYLES[currentSession.category].color}>
                                                        {CATEGORY_STYLES[currentSession.category].icon}
                                                    </span>
                                                    <span className="text-white/80">{CATEGORY_STYLES[currentSession.category].label}</span>
                                                </>
                                            )}
                                            <ChevronDown size={12} className={`text-white/60 transition-transform ${showModeSelect ? 'rotate-180' : ''}`} />
                                        </button>
                                        {showModeSelect && (
                                            <>
                                                {/* Overlay to close on click outside */}
                                                <div
                                                    className="fixed inset-0 z-10"
                                                    onClick={() => setShowModeSelect(false)}
                                                />
                                                <div className="absolute top-full left-0 mt-1 backdrop-blur-3xl bg-black/50 border border-white/10 rounded-xl shadow-2xl py-1 z-[9999] min-w-[140px] ring-1 ring-white/10">
                                                    {Object.entries(CATEGORY_STYLES).map(([catNum, style]) => {
                                                        const categoryNum = parseInt(catNum);
                                                        return (
                                                            <button
                                                                key={categoryNum}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (currentSession?.category !== categoryNum) {
                                                                        createLocalSession(categoryNum);
                                                                    }
                                                                    setShowModeSelect(false);
                                                                }}
                                                                className={`w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 ${currentSession?.category === categoryNum ? 'bg-white/10' : ''}`}
                                                            >
                                                                <span className={style.color}>{style.icon}</span>
                                                                <span className="text-sm text-white">{style.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <p className="text-white/50 text-xs truncate">{currentSession?.title || '新对话'}</p>
                            </div>
                        </div>
                        <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-xl no-drag flex-shrink-0"><Minus size={16} className="text-white/70" /></button>
                    </div>

                    {/* Rest of UI (Context, Model, Messages, Input) */}
                    {currentWord && currentSession?.category === 1 && (
                        <div className="px-3 py-2 bg-gradient-to-r from-purple-500/15 to-blue-500/15 border-b border-white/10 flex items-center justify-between no-drag backdrop-blur-sm">
                            <div className="flex items-center gap-2 truncate">
                                <BookOpen size={14} className="text-purple-300 flex-shrink-0" />
                                <span className="text-sm text-white/80">单词:</span>
                                <span className="text-sm font-semibold text-white truncate">{currentWord}</span>
                            </div>
                            <button onClick={() => setCurrentWord(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
                                <X size={14} className="text-white/50 hover:text-white/80" />
                            </button>
                        </div>
                    )}

                    <div className="px-3 py-2 bg-white/5 border-b border-white/10 no-drag backdrop-blur-sm">
                        <div className="relative">
                            <button onClick={() => setShowModelSelect(!showModelSelect)} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
                                <span className="text-white/40">模型:</span>
                                <span className="font-medium">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                                <ChevronDown size={14} className={`transition-transform ${showModelSelect ? 'rotate-180' : ''}`} />
                            </button>
                            {showModelSelect && (
                                <div className="absolute top-full left-0 mt-1 backdrop-blur-2xl bg-black/60 border border-white/15 rounded-xl shadow-xl py-1 z-10 min-w-[180px]">
                                    {MODELS.map(model => (
                                        <button key={model.id} onClick={() => { setSelectedModel(model.id); setShowModelSelect(false); }}
                                            className={`w-full px-3 py-2 text-left hover:bg-white/10 ${selectedModel === model.id ? 'bg-white/10' : ''}`}>
                                            <div className="text-sm font-medium text-white">{model.name}</div>
                                            <div className="text-xs text-white/50">{model.description}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl backdrop-blur-sm ${msg.role === 'user' ? 'bg-purple-500/30 text-white' : 'bg-white/10 text-white/90'}`}>
                                    <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {streamingContent && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] p-3 rounded-2xl bg-white/10 text-white/90 backdrop-blur-sm">
                                    <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown></div>
                                </div>
                            </div>
                        )}
                        {isLoading && !streamingContent && (
                            <div className="flex justify-start"><div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm"><Loader2 className="w-5 h-5 text-white/50 animate-spin" /></div></div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-sm">
                        <div className="flex gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="输入..."
                                rows={1}
                                className="flex-1 bg-white/10 text-white placeholder-white/40 rounded-xl px-4 py-3 resize-none outline-none focus:ring-2 ring-purple-500/50 backdrop-blur-sm"
                            />
                            {isLoading ? (
                                <button onClick={stopGeneration} className="px-4 py-2 bg-red-500/30 hover:bg-red-500/40 rounded-xl transition-colors backdrop-blur-sm"><Square size={18} className="text-white" /></button>
                            ) : (
                                <button onClick={sendMessage} disabled={!input.trim()} className="px-4 py-2 bg-purple-500/30 hover:bg-purple-500/40 rounded-xl transition-colors disabled:opacity-50 backdrop-blur-sm"><Send size={18} className="text-white" /></button>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
