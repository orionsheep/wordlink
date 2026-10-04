'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cachedFetch } from '@/lib/client-cache';

interface UserContext {
    recentHistory: { word: string; timestamp: string }[];
    recentTests: { word: string; score: number; testType: number; timestamp: string }[];
    currentWord?: string;
}

interface AIContextType {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    userContext: UserContext | null;
    refreshUserContext: () => Promise<void>;
    currentWord: string | null;
    setCurrentWord: (word: string | null) => void;
    openWithWord: (word: string) => void;
    ballPosition: { x: number; y: number };
    setBallPosition: (pos: { x: number; y: number }) => void;
    currentWordGroup: string | null;
    openWithWordGroup: (words: string[]) => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

const AI_CONTEXT_TTL_MS = 60 * 1000;

export function AIProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [userContext, setUserContext] = useState<UserContext | null>(null);
    const [currentWord, setCurrentWord] = useState<string | null>(null);
    const [currentWordGroup, setCurrentWordGroup] = useState<string | null>(null); // Comma separated
    const [ballPosition, setBallPosition] = useState({ x: -1, y: -1 });

    const refreshUserContext = useCallback(async () => {
        try {
            const data = await cachedFetch<UserContext>('ai:context', async () => {
                const res = await fetch('/api/ai/context', {
                    credentials: 'include'
                });
                return res.ok ? (await res.json()) as UserContext : null;
            }, AI_CONTEXT_TTL_MS);
            if (data) {
                setUserContext(data);
            }
        } catch (error) {
            console.error('Failed to fetch AI context:', error);
        }
    }, []);

    // Open AI chat with specific word context
    const openWithWord = useCallback((word: string) => {
        setCurrentWord(word);
        setCurrentWordGroup(null); // Clear group
        setIsOpen(true);
    }, []);

    const openWithWordGroup = useCallback((words: string[]) => {
        setCurrentWordGroup(words.join(','));
        setCurrentWord(null); // Clear single word
        setIsOpen(true);
    }, []);

    // Fetch user context lazily — only when the chat is actually opened,
    // not on every page mount. The 60s cache keeps re-opens instant.
    useEffect(() => {
        if (isOpen) {
            void refreshUserContext();
        }
    }, [isOpen, refreshUserContext]);

    return (
        <AIContext.Provider value={{
            isOpen,
            setIsOpen,
            userContext,
            refreshUserContext,
            currentWord,
            setCurrentWord,
            openWithWord,
            ballPosition,
            setBallPosition,
            currentWordGroup,
            openWithWordGroup,
        }}>
            {children}
        </AIContext.Provider>
    );
}

export function useAI() {
    const context = useContext(AIContext);
    if (context === undefined) {
        throw new Error('useAI must be used within an AIProvider');
    }
    return context;
}
