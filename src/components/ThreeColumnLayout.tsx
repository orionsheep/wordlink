'use client';

import { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import WordList from './WordList';
import WordDetail from './WordDetail';
import PanelFissionGraph from './PanelFissionGraph';
import { ChevronLeft, ChevronRight, PanelLeftOpen, User, LogOut, BrainCircuit, Clock, Settings, Library } from 'lucide-react';
import Link from 'next/link';
import LoginModal from './LoginModal';
import ImmersiveToggle from './ImmersiveToggle';
import SettingsModal from './SettingsModal';

// Simple Toast Component
function Toast({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg z-[100] animate-fade-in-down backdrop-blur-sm border border-red-400/50">
            {message}
        </div>
    );
}

export default function ThreeColumnLayout() {
    return (
        <ThreeColumnLayoutContent />
    );
}

function ThreeColumnLayoutContent() {
    const router = useRouter();
    const t = useTranslations();

    type AuthUser = {
        id: string;
        email?: string;
        username?: string;
        role?: string;
    };

    const [selectedWord, setSelectedWord] = useState<string | null>(null);
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Auth State
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    // Navigation History
    const [history, setHistory] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);

    // Toast State
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Word Existence Check
    const [allWords, setAllWords] = useState<Set<string>>(new Set());

    useEffect(() => {
        setMounted(true);

        // Restore browsing history from localStorage
        try {
            const savedHistory = localStorage.getItem('dashboard_wordBrowsingHistory');
            const savedIndex = localStorage.getItem('dashboard_wordBrowsingIndex');

            if (savedHistory && savedIndex) {
                const parsedHistory = JSON.parse(savedHistory);
                const parsedIndex = parseInt(savedIndex, 10);

                if (parsedHistory.length > 0 && parsedIndex >= 0 && parsedIndex < parsedHistory.length) {
                    setHistory(parsedHistory);
                    setCurrentIndex(parsedIndex);
                    setSelectedWord(parsedHistory[parsedIndex]);
                }
            }
        } catch (error) {
            console.error('Failed to restore browsing history:', error);
        }

        // Fetch all words for validation
        fetch('/api/words').then(res => res.json()).then((words: string[]) => {
            setAllWords(new Set(words.map(w => w.toLowerCase())));
        });

        // Fetch current user
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

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);

        try {
            const res = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || t('layout.logoutFailed'));
            }

            setUser(null);
            showToast(t('layout.logoutSuccess'));

            // Redirect to login page after successful logout
            setTimeout(() => {
                router.push('/login');
            }, 500);
        } catch (error) {
            const message = error instanceof Error ? error.message : t('layout.logoutFailed');
            showToast(message);
        } finally {
            window.dispatchEvent(new CustomEvent('auth-state-changed'));
            setIsLoggingOut(false);
        }
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const handleSelectWord = (word: string) => {
        const normalizedWord = word.toLowerCase();

        if (allWords.size > 0 && !allWords.has(normalizedWord)) {
            showToast(t('layout.wordNotFound', { word }));
            return;
        }

        if (selectedWord === normalizedWord) return;

        const newHistory = history.slice(0, currentIndex + 1);
        newHistory.push(normalizedWord);
        const newIndex = newHistory.length - 1;

        setHistory(newHistory);
        setCurrentIndex(newIndex);
        setSelectedWord(normalizedWord);

        // Save to localStorage
        try {
            localStorage.setItem('dashboard_wordBrowsingHistory', JSON.stringify(newHistory));
            localStorage.setItem('dashboard_wordBrowsingIndex', newIndex.toString());
        } catch (error) {
            console.error('Failed to save browsing history:', error);
        }

        // Record visit if logged in
        if (user) {
            fetch('/api/user/visit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word: normalizedWord }),
                credentials: 'include'
            });
        }
    };

    const handleBack = () => {
        if (currentIndex > 0) {
            const newIndex = currentIndex - 1;
            setCurrentIndex(newIndex);
            setSelectedWord(history[newIndex]);

            // Save to localStorage
            try {
                localStorage.setItem('dashboard_wordBrowsingIndex', newIndex.toString());
            } catch (error) {
                console.error('Failed to save browsing index:', error);
            }
        }
    };

    const handleForward = () => {
        if (currentIndex < history.length - 1) {
            const newIndex = currentIndex + 1;
            setCurrentIndex(newIndex);
            setSelectedWord(history[newIndex]);

            // Save to localStorage
            try {
                localStorage.setItem('dashboard_wordBrowsingIndex', newIndex.toString());
            } catch (error) {
                console.error('Failed to save browsing index:', error);
            }
        }
    };

    if (!mounted) return null;

    return (
        <div className="h-screen w-full bg-black flex flex-col overflow-hidden">
            <Toast message={toastMessage} />

            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
                onLoginSuccess={(u) => {
                    setUser(u);
                    showToast(t('layout.welcomeBack', { name: u.email || u.username || 'user' }));
                }}
            />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Main Content Area - Takes remaining space */}
            <div className="flex-1 overflow-hidden">
                <PanelGroup direction="horizontal">
                    {/* Left Column: Word List */}
                    {isLeftSidebarOpen ? (
                        <>
                            <Panel defaultSize={20} minSize={15} maxSize={30} className="bg-black border-r border-neutral-900">
                                <WordList
                                    onWordSelect={handleSelectWord}
                                    selectedWord={selectedWord}
                                    onToggleSidebar={() => setIsLeftSidebarOpen(false)}
                                    isSidebarCollapsed={false}
                                    onOpenSettings={() => setIsSettingsOpen(true)}
                                />
                            </Panel>
                            <PanelResizeHandle className="w-1 bg-neutral-900 hover:bg-blue-500 transition-colors" />
                        </>
                    ) : null}

                    {/* Middle Column: Word Details */}
                    <Panel defaultSize={40} minSize={30} className="bg-black relative flex flex-col border-r border-neutral-900">
                        {/* Header with Navigation & Toggle */}
                        <div className="h-14 border-b border-neutral-900 flex items-center px-4 justify-between bg-black/50 backdrop-blur-md z-20">
                            <div className="flex items-center gap-2">
                                {!isLeftSidebarOpen && (
                                    <button
                                        onClick={() => setIsLeftSidebarOpen(true)}
                                        className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                                        title={t('layout.openSidebar')}
                                    >
                                        <PanelLeftOpen size={20} />
                                    </button>
                                )}
                                <div className="flex items-center bg-neutral-900/50 rounded-lg p-1 border border-neutral-800">
                                    <button
                                        id="nav-back"
                                        onClick={handleBack}
                                        disabled={currentIndex <= 0}
                                        className={`p-1 rounded-md transition-colors ${currentIndex <= 0 ? 'text-neutral-700 cursor-not-allowed' : 'text-neutral-400 hover:text-white hover:bg-neutral-700'}`}
                                        title={t('layout.historyBack')}
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button
                                        id="nav-forward"
                                        onClick={handleForward}
                                        disabled={currentIndex >= history.length - 1}
                                        className={`p-1 rounded-md transition-colors ${currentIndex >= history.length - 1 ? 'text-neutral-700 cursor-not-allowed' : 'text-neutral-400 hover:text-white hover:bg-neutral-700'}`}
                                        title={t('layout.historyForward')}
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <WordDetail
                            word={selectedWord}
                            onWordClick={handleSelectWord}
                            currentUserId={user?.id}
                            onPrevWord={handleBack}
                            onNextWord={handleForward}
                        />
                    </Panel>

                    <PanelResizeHandle className="w-1 bg-neutral-900 hover:bg-blue-500 transition-colors" />

                    {/* Right Column: Fission Graph */}
                    <Panel defaultSize={40} minSize={30} className="bg-black relative">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-900/20 via-black to-black pointer-events-none z-0" />
                        <PanelFissionGraph word={selectedWord} onNodeClick={handleSelectWord} />
                    </Panel>
                </PanelGroup>
            </div>

            {/* Global Footer */}
            <div className="h-10 bg-black border-t border-neutral-900 flex items-center justify-between px-4">
                {/* Left: Login / User Info */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-neutral-500 hover:text-white transition-colors p-1"
                        title={t('layout.settings')}
                    >
                        <Settings size={16} />
                    </button>
                    <div className="h-4 w-[1px] bg-neutral-800 mx-1"></div>
                    {user ? (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 px-2 py-1 rounded-md border border-neutral-800">
                                <User size={12} />
                                <span>{user.email || user.username}</span>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="text-neutral-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={isLoggingOut ? t('layout.loggingOut') : t('layout.logout')}
                                disabled={isLoggingOut}
                            >
                                <LogOut size={14} />
                            </button>
                            <Link href="/dashboard" className="text-xs text-blue-500 hover:text-blue-400 ml-2">
                                {t('layout.dashboard')}
                            </Link>
                            <Link href="/my-libraries" className="text-xs text-purple-500 hover:text-purple-400 ml-2">
                                {t('layout.myLibraries')}
                            </Link>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsLoginModalOpen(true)}
                            className="flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors"
                        >
                            <User size={14} />
                            <span>{t('layout.login')}</span>
                        </button>
                    )}
                </div>

                {/* Center: Branding */}
                <p className="text-xs text-neutral-600 tracking-wider font-light absolute left-1/2 transform -translate-x-1/2">
                    {t('layout.branding')}
                </p>

                {/* Right: Quiz Entry */}
                <div className="flex items-center">
                    <Link
                        href="/history"
                        className="flex items-center gap-2 text-xs text-neutral-500 hover:text-green-400 transition-colors group mr-4"
                    >
                        <span>{t('layout.history')}</span>
                        <Clock size={14} className="group-hover:text-green-400" />
                    </Link>
                    <Link
                        href="/quiz"
                        className="flex items-center gap-2 text-xs text-neutral-500 hover:text-blue-400 transition-colors group"
                    >
                        <span>{t('layout.quizMode')}</span>
                        <BrainCircuit size={14} className="group-hover:text-blue-400" />
                    </Link>
                    <div className="ml-4 pl-4 border-l border-neutral-800">
                        <ImmersiveToggle variant="inline" currentWord={selectedWord} />
                    </div>
                </div>
            </div>
        </div>
    );
}
