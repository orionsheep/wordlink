'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface Shortcuts {
    quiz_reveal: string;
    quiz_easy: string;
    quiz_hard: string;
    quiz_unknown: string;
    audio_us: string;
    audio_uk: string;
    nav_prev: string;
    nav_next: string;
    list_prev: string;
    list_next: string;
}

export type LayoutMode = 'mobile' | 'desktop';

interface Settings {
    groupSize: number;
    showChinese: boolean;
    showScore: boolean;
    dashboardPageSize: number;
    shortcuts: Shortcuts;
    showHoverTooltip: boolean;
    showWordDetailTooltip: boolean;
    showGraphTooltip: boolean;
    // AI Settings
    aiEnabled: boolean;
    aiDefaultModel: string;
    // Layout
    layoutMode: LayoutMode;
    showBottomNav: boolean;
}

interface SettingsContextType extends Settings {
    updateSettings: (newSettings: Partial<Settings>) => void;
    resetShortcuts: () => void;
    isFullscreen: boolean;
    toggleFullscreen: () => void;
    toggleBottomNav: () => void;
}

const defaultShortcuts: Shortcuts = {
    quiz_reveal: ' ',
    quiz_easy: 'z',
    quiz_hard: 'x',
    quiz_unknown: 'c',
    audio_us: 'e',
    audio_uk: 'q',
    nav_prev: 'a',
    nav_next: 'd',
    list_prev: 'w',
    list_next: 's',
};

const defaultSettings: Settings = {
    groupSize: 100,
    showChinese: true,
    showScore: true,
    dashboardPageSize: 20,
    shortcuts: defaultShortcuts,
    showHoverTooltip: true,
    showWordDetailTooltip: true,
    showGraphTooltip: true,
    // AI Settings
    aiEnabled: false,
    aiDefaultModel: 'deepseek-chat',
    // Layout
    layoutMode: 'mobile' as LayoutMode,
    showBottomNav: true,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
};

type LegacyNavigator = Navigator & {
    standalone?: boolean;
};

function getIsFullscreenLike(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return false;
    }

    const fullscreenDocument = document as FullscreenDocument;
    const hasFullscreenElement = !!(
        fullscreenDocument.fullscreenElement ||
        fullscreenDocument.webkitFullscreenElement ||
        fullscreenDocument.mozFullScreenElement ||
        fullscreenDocument.msFullscreenElement
    );

    const isDisplayModeFullscreen =
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches;

    const isIOSStandalone = !!(navigator as LegacyNavigator).standalone;

    return hasFullscreenElement || isDisplayModeFullscreen || isIOSStandalone;
}

function hasFullscreenElement(fullscreenDocument: FullscreenDocument): boolean {
    return !!(
        fullscreenDocument.fullscreenElement ||
        fullscreenDocument.webkitFullscreenElement ||
        fullscreenDocument.mozFullScreenElement ||
        fullscreenDocument.msFullscreenElement
    );
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [loaded, setLoaded] = useState(false);
    const [systemFullscreen, setSystemFullscreen] = useState(false);
    const [manualFullscreen, setManualFullscreen] = useState(false);
    const isFullscreen = systemFullscreen || manualFullscreen;

    useEffect(() => {
        const saved = localStorage.getItem('appSettings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Merge with default settings to ensure new fields (like shortcuts) are present
                setSettings({
                    ...defaultSettings,
                    ...parsed,
                    shortcuts: { ...defaultSettings.shortcuts, ...(parsed.shortcuts || {}) }
                });
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        }
        setLoaded(true);
    }, []);

    // Fullscreen state management
    useEffect(() => {
        const handleFullscreenChange = () => {
            setSystemFullscreen(getIsFullscreenLike());
        };

        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }

        // Listen for all browser fullscreen change events
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        // Listen for display mode changes (PWA standalone/fullscreen/minimal-ui)
        const displayModeQueries = [
            window.matchMedia('(display-mode: fullscreen)'),
            window.matchMedia('(display-mode: standalone)'),
            window.matchMedia('(display-mode: minimal-ui)'),
        ];

        const addDisplayModeListener = (mediaQuery: MediaQueryList) => {
            if (typeof mediaQuery.addEventListener === 'function') {
                mediaQuery.addEventListener('change', handleFullscreenChange);
                return;
            }
            mediaQuery.addListener(handleFullscreenChange);
        };

        const removeDisplayModeListener = (mediaQuery: MediaQueryList) => {
            if (typeof mediaQuery.removeEventListener === 'function') {
                mediaQuery.removeEventListener('change', handleFullscreenChange);
                return;
            }
            mediaQuery.removeListener(handleFullscreenChange);
        };

        displayModeQueries.forEach(addDisplayModeListener);
        window.addEventListener('resize', handleFullscreenChange);
        window.addEventListener('pageshow', handleFullscreenChange);
        document.addEventListener('visibilitychange', handleFullscreenChange);

        // Initialize state
        handleFullscreenChange();

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
            displayModeQueries.forEach(removeDisplayModeListener);
            window.removeEventListener('resize', handleFullscreenChange);
            window.removeEventListener('pageshow', handleFullscreenChange);
            document.removeEventListener('visibilitychange', handleFullscreenChange);
        };
    }, []);

    useEffect(() => {
        if (systemFullscreen && manualFullscreen) {
            setManualFullscreen(false);
        }
    }, [systemFullscreen, manualFullscreen]);

    const updateSettings = (newSettings: Partial<Settings>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            localStorage.setItem('appSettings', JSON.stringify(updated));
            return updated;
        });
    };

    const resetShortcuts = () => {
        updateSettings({ shortcuts: defaultShortcuts });
    };

    const toggleBottomNav = () => {
        updateSettings({ showBottomNav: !settings.showBottomNav });
    };

    const toggleFullscreen = async () => {
        try {
            const fullscreenDocument = document as FullscreenDocument;
            const isApiFullscreen = hasFullscreenElement(fullscreenDocument);
            const elem = document.documentElement as FullscreenElement;
            const canRequestFullscreen = !!(
                elem.requestFullscreen ||
                elem.webkitRequestFullscreen ||
                elem.mozRequestFullScreen ||
                elem.msRequestFullscreen
            );

            // Manual fallback mode: browser doesn't enter fullscreen, but user still wants mobile fullscreen layout.
            if (manualFullscreen && !isApiFullscreen) {
                setManualFullscreen(false);
                return;
            }

            if (!isApiFullscreen && canRequestFullscreen) {
                // Enter fullscreen
                if (elem.requestFullscreen) {
                    await elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) {
                    await elem.webkitRequestFullscreen();
                } else if (elem.mozRequestFullScreen) {
                    await elem.mozRequestFullScreen();
                } else if (elem.msRequestFullscreen) {
                    await elem.msRequestFullscreen();
                }

                // Best-effort portrait lock on mobile fullscreen (supported browsers only)
                const isMobileDevice =
                    window.matchMedia('(pointer: coarse)').matches ||
                    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
                const orientation = screen.orientation as ScreenOrientation & {
                    lock?: (orientation: 'portrait' | 'landscape') => Promise<void>;
                    unlock?: () => void;
                };
                if (isMobileDevice && orientation && typeof orientation.lock === 'function') {
                    try {
                        await orientation.lock('portrait');
                    } catch {
                        // Ignore when browser requires different permission/context.
                    }
                }
                return;
            }

            if (isApiFullscreen) {
                // Exit fullscreen
                if (fullscreenDocument.exitFullscreen) {
                    await fullscreenDocument.exitFullscreen();
                } else if (fullscreenDocument.webkitExitFullscreen) {
                    await fullscreenDocument.webkitExitFullscreen();
                } else if (fullscreenDocument.mozCancelFullScreen) {
                    await fullscreenDocument.mozCancelFullScreen();
                } else if (fullscreenDocument.msExitFullscreen) {
                    await fullscreenDocument.msExitFullscreen();
                }

                const orientation = screen.orientation as ScreenOrientation & {
                    lock?: (orientation: 'portrait' | 'landscape') => Promise<void>;
                    unlock?: () => void;
                };
                if (orientation && typeof orientation.unlock === 'function') {
                    orientation.unlock();
                }
                setManualFullscreen(false);
                return;
            }

            // No fullscreen API available (or request failed previously): fallback to manual layout forcing.
            setManualFullscreen(true);
        } catch (error) {
            console.error('Fullscreen toggle failed:', error);
            // Fallback for browsers that reject fullscreen requests at runtime.
            setManualFullscreen(true);
        }
    };

    if (!loaded) {
        return null; // Or a loading spinner
    }

    return (
        <SettingsContext.Provider value={{ ...settings, updateSettings, resetShortcuts, isFullscreen, toggleFullscreen, toggleBottomNav }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
