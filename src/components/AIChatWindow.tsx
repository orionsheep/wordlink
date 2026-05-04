'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, ChevronDown, Loader2, Minimize2, Maximize2, GripVertical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface AIChatWindowProps {
    word: string;
    onClose: () => void;
}

const MODELS = [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', description: 'Fast & efficient' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: 'Complex reasoning' },
];

const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;

export default function AIChatWindow({ word, onClose }: AIChatWindowProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState('deepseek-chat');
    const [showModelSelect, setShowModelSelect] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');

    // Position and size state
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [size, setSize] = useState({ width: 420, height: 600 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Initialize position to bottom-right
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setPosition({
                x: window.innerWidth - size.width - 20,
                y: window.innerHeight - size.height - 20,
            });
        }
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Add initial greeting
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([{
                role: 'assistant',
                content: `👋 Hi! I'm here to help you learn about **"${word}"**.\n\nYou can ask me:\n- What does this word mean?\n- How do I pronounce it?\n- Can you give me example sentences?\n- What are similar words?\n- What's the etymology?\n\nFeel free to ask anything!`
            }]);
        }
    }, [word]);

    // Drag handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.no-drag')) return;
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    }, [position]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging) {
            const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.x));
            const newY = Math.max(0, Math.min(window.innerHeight - size.height, e.clientY - dragOffset.y));
            setPosition({ x: newX, y: newY });
        }

        if (isResizing) {
            e.preventDefault();
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;

            let newWidth = size.width;
            let newHeight = size.height;
            let newX = position.x;
            let newY = position.y;

            if (isResizing.includes('e')) {
                newWidth = Math.max(MIN_WIDTH, e.clientX - position.x);
            }
            if (isResizing.includes('w')) {
                const delta = position.x - e.clientX;
                newWidth = Math.max(MIN_WIDTH, size.width + delta);
                if (newWidth > MIN_WIDTH) {
                    newX = e.clientX;
                }
            }
            if (isResizing.includes('s')) {
                newHeight = Math.max(MIN_HEIGHT, e.clientY - position.y);
            }
            if (isResizing.includes('n')) {
                const delta = position.y - e.clientY;
                newHeight = Math.max(MIN_HEIGHT, size.height + delta);
                if (newHeight > MIN_HEIGHT) {
                    newY = e.clientY;
                }
            }

            setSize({ width: newWidth, height: newHeight });
            setPosition({ x: newX, y: newY });
        }
    }, [isDragging, isResizing, dragOffset, position, size]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(null);
    }, []);

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);
        setStreamingContent('');

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, { role: 'user', content: userMessage }],
                    model: selectedModel,
                    word,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

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
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content || '';
                                if (content) {
                                    fullContent += content;
                                    setStreamingContent(fullContent);
                                }
                            } catch {
                                // Ignore parse errors for incomplete JSON
                            }
                        }
                    }
                }
            }

            // Add the complete message
            setMessages(prev => [...prev, { role: 'assistant', content: fullContent || 'Sorry, I could not generate a response.' }]);
            setStreamingContent('');
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '❌ Sorry, there was an error connecting to the AI. Please try again.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (isMinimized) {
        return (
            <div
                className="fixed bottom-4 right-4 z-50 backdrop-blur-2xl bg-white/10 text-white px-4 py-3 rounded-2xl shadow-2xl cursor-pointer flex items-center gap-3 hover:scale-105 transition-all border border-white/20 hover:bg-white/15"
                onClick={() => setIsMinimized(false)}
            >
                <Sparkles size={20} className="text-purple-300" />
                <span className="font-medium">AI Chat: {word}</span>
                <Maximize2 size={16} className="text-white/70" />
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="fixed z-50 backdrop-blur-2xl bg-black/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: size.height,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
        >
            {/* Resize handles */}
            {/* Corners */}
            <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-10" onMouseDown={() => setIsResizing('nw')} />
            <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-10" onMouseDown={() => setIsResizing('ne')} />
            <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-10" onMouseDown={() => setIsResizing('sw')} />
            <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10" onMouseDown={() => setIsResizing('se')} />
            {/* Edges */}
            <div className="absolute top-0 left-3 right-3 h-1 cursor-n-resize z-10" onMouseDown={() => setIsResizing('n')} />
            <div className="absolute bottom-0 left-3 right-3 h-1 cursor-s-resize z-10" onMouseDown={() => setIsResizing('s')} />
            <div className="absolute left-0 top-3 bottom-3 w-1 cursor-w-resize z-10" onMouseDown={() => setIsResizing('w')} />
            <div className="absolute right-0 top-3 bottom-3 w-1 cursor-e-resize z-10" onMouseDown={() => setIsResizing('e')} />

            {/* Header - Draggable */}
            <div
                className="bg-gradient-to-r from-purple-500/30 to-blue-500/30 backdrop-blur-md p-4 flex items-center justify-between cursor-move select-none border-b border-white/10"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-3">
                    <GripVertical className="text-white/40" size={16} />
                    <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/50 to-blue-500/50 backdrop-blur-sm">
                        <Sparkles className="text-white" size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-sm">AI Vocabulary Tutor</h3>
                        <p className="text-white/50 text-xs">Studying: {word}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 no-drag">
                    <button
                        onClick={() => setIsMinimized(true)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                        title="Minimize"
                    >
                        <Minimize2 size={16} className="text-white/70" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-red-500/30 rounded-xl transition-colors"
                        title="Close"
                    >
                        <X size={16} className="text-white/70" />
                    </button>
                </div>
            </div>

            {/* Model Selector */}
            <div className="px-4 py-2 bg-white/5 border-b border-white/10 no-drag">
                <div className="relative">
                    <button
                        onClick={() => setShowModelSelect(!showModelSelect)}
                        className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
                    >
                        <span className="text-white/40">Model:</span>
                        <span className="font-medium">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                        <ChevronDown size={14} className={`transition-transform ${showModelSelect ? 'rotate-180' : ''}`} />
                    </button>

                    {showModelSelect && (
                        <div className="absolute top-full left-0 mt-1 backdrop-blur-2xl bg-black/60 border border-white/15 rounded-xl shadow-xl py-1 z-10 min-w-[200px]">
                            {MODELS.map(model => (
                                <button
                                    key={model.id}
                                    onClick={() => {
                                        setSelectedModel(model.id);
                                        setShowModelSelect(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left hover:bg-white/10 transition-colors ${selectedModel === model.id ? 'bg-white/10' : ''}`}
                                >
                                    <div className="text-sm font-medium text-white">{model.name}</div>
                                    <div className="text-xs text-white/50">{model.description}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-drag">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 backdrop-blur-sm ${message.role === 'user'
                                ? 'bg-gradient-to-r from-purple-500/60 to-blue-500/60 text-white border border-white/10'
                                : 'bg-white/10 text-white/90 border border-white/5'
                                }`}
                        >
                            {message.role === 'assistant' ? (
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown>{message.content}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            )}
                        </div>
                    </div>
                ))}

                {/* Streaming content */}
                {streamingContent && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-white/10 text-white/90 backdrop-blur-sm border border-white/5">
                            <div className="prose prose-invert prose-sm max-w-none">
                                <ReactMarkdown>{streamingContent}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading indicator */}
                {isLoading && !streamingContent && (
                    <div className="flex justify-start">
                        <div className="bg-white/10 text-white/60 rounded-2xl px-4 py-3 flex items-center gap-2 backdrop-blur-sm border border-white/5">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-sm">Thinking...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-white/5 no-drag">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Ask about "${word}"...`}
                        rows={1}
                        className="flex-1 bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 resize-none focus:outline-none focus:border-purple-400/50 focus:bg-white/15 transition-all backdrop-blur-sm"
                        style={{ minHeight: '44px', maxHeight: '120px' }}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!input.trim() || isLoading}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500/70 to-blue-500/70 hover:from-purple-500/90 hover:to-blue-500/90 disabled:from-white/10 disabled:to-white/10 disabled:cursor-not-allowed text-white rounded-xl transition-all border border-white/10"
                    >
                        <Send size={18} />
                    </button>
                </div>
                <p className="text-xs text-white/30 mt-2 text-center">
                    Press Enter to send, Shift+Enter for new line
                </p>
            </div>
        </div>
    );
}
