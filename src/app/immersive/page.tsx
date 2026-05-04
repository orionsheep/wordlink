'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import DraggableContainer from '@/components/DraggableContainer';
import WordList from '@/components/WordList';
import WordDetail from '@/components/WordDetail';
import ImmersiveToggle from '@/components/ImmersiveToggle';
import FissionGraph from '@/components/FissionGraph';
import { useSettings } from '@/context/SettingsContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ImmersivePage() {
    const searchParams = useSearchParams();
    const initialWord = searchParams.get('word');

    // History State
    const [history, setHistory] = useState<string[]>(initialWord ? [initialWord] : []);
    const [currentIndex, setCurrentIndex] = useState(initialWord ? 0 : -1);

    const [showList, setShowList] = useState(true);
    const [showDetail, setShowDetail] = useState(true);
    const { updateSettings } = useSettings();

    // Auth State
    type AuthUser = {
        id: string;
        email?: string;
        username?: string;
        role?: string;
    };
    const [user, setUser] = useState<AuthUser | null>(null);

    // Fetch current user on mount
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch('/api/auth/me', {
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.user) {
                    setUser(data.user);
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error('Failed to fetch user:', err);
                setUser(null);
            }
        };

        fetchUser();

        // Listen for auth state changes
        const handleAuthChange = () => {
            fetchUser();
        };

        window.addEventListener('auth-state-changed', handleAuthChange);

        return () => {
            window.removeEventListener('auth-state-changed', handleAuthChange);
        };
    }, []);

    // Load current word from localStorage on mount (shared with dashboard)
    useEffect(() => {
        try {
            const savedWord = localStorage.getItem('currentWord');
            if (savedWord) {
                // If we have a URL word that's different, use that instead
                if (initialWord && initialWord.toLowerCase() !== savedWord.toLowerCase()) {
                    setHistory([initialWord]);
                    setCurrentIndex(0);
                } else {
                    setHistory([savedWord]);
                    setCurrentIndex(0);
                }
            }
        } catch (error) {
            console.error('Failed to restore current word:', error);
        }
    }, [initialWord]);

    // Save current word to localStorage (shared with dashboard)
    useEffect(() => {
        if (history.length > 0 && currentIndex >= 0) {
            try {
                localStorage.setItem('currentWord', history[currentIndex]);
            } catch (error) {
                console.error('Failed to save current word:', error);
            }
        }
    }, [history, currentIndex]);

    // Handle word selection with history management
    const handleWordSelect = (word: string) => {
        // If clicking the same word, do nothing
        if (currentIndex >= 0 && history[currentIndex] === word) return;

        const newHistory = [...history.slice(0, currentIndex + 1), word];
        setHistory(newHistory);
        setCurrentIndex(newHistory.length - 1);

        // Ensure detail window is open
        if (!showDetail) setShowDetail(true);

        // Always attempt to record visit - server will handle auth
        fetch('/api/user/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: word.toLowerCase() }),
            credentials: 'include'
        }).catch(() => {
            // Silent failure - user might not be logged in or network issue
        });
    };

    const goBack = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const goForward = () => {
        if (currentIndex < history.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const currentWord = currentIndex >= 0 ? history[currentIndex] : null;

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-black">
            {/* Background Graph */}
            <div className="absolute inset-0 z-0">
                <FissionGraph
                    word={currentWord}
                    onNodeClick={handleWordSelect}
                    mode="immersive"
                />
            </div>

            {/* Word List Window */}
            {showList && (
                <DraggableContainer
                    title="Word Library"
                    initialPosition={{ x: 40, y: 40 }}
                    initialSize={{ width: 350, height: 600 }}
                    onClose={() => setShowList(false)}
                >
                    <WordList
                        onWordSelect={handleWordSelect}
                        selectedWord={currentWord}
                        isSidebarCollapsed={false}
                        onToggleSidebar={() => { }}
                        transparent={true}
                        onOpenSettings={() => { }}
                    />
                </DraggableContainer>
            )}

            {/* Word Detail Window */}
            {showDetail && (
                <DraggableContainer
                    title={currentWord || "Word Details"}
                    initialPosition={{ x: 420, y: 40 }}
                    initialSize={{ width: 500, height: 600 }}
                    onClose={() => setShowDetail(false)}
                    headerActions={
                        <div className="flex items-center gap-1 mr-2">
                            <button
                                onClick={goBack}
                                disabled={currentIndex <= 0}
                                className={`p-1 rounded-full transition-colors ${currentIndex > 0
                                    ? 'text-white hover:bg-white/20'
                                    : 'text-white/20 cursor-not-allowed'
                                    }`}
                                title="Back"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                onClick={goForward}
                                disabled={currentIndex >= history.length - 1}
                                className={`p-1 rounded-full transition-colors ${currentIndex < history.length - 1
                                    ? 'text-white hover:bg-white/20'
                                    : 'text-white/20 cursor-not-allowed'
                                    }`}
                                title="Forward"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    }
                >
                    <WordDetail
                        word={currentWord}
                        onWordClick={handleWordSelect}
                        transparent={true}
                        onPrevWord={goBack}
                        onNextWord={goForward}
                    />
                </DraggableContainer>
            )}

            {/* Re-open buttons if closed */}
            <div className="fixed bottom-6 left-6 flex gap-2 z-40">
                {!showList && (
                    <button
                        onClick={() => setShowList(true)}
                        className="px-4 py-2 bg-black/60 backdrop-blur-md text-white rounded-lg hover:bg-black/80 transition-colors border border-white/10 text-sm font-medium"
                    >
                        Show Library
                    </button>
                )}
                {!showDetail && (
                    <button
                        onClick={() => setShowDetail(true)}
                        className="px-4 py-2 bg-black/60 backdrop-blur-md text-white rounded-lg hover:bg-black/80 transition-colors border border-white/10 text-sm font-medium"
                    >
                        Show Details
                    </button>
                )}
            </div>

            <ImmersiveToggle />
        </div>
    );
}
