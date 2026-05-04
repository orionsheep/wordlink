'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

export function AIProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [userContext, setUserContext] = useState<UserContext | null>(null);
    const [currentWord, setCurrentWord] = useState<string | null>(null);
    const [currentWordGroup, setCurrentWordGroup] = useState<string | null>(null); // Comma separated
    const [ballPosition, setBallPosition] = useState({ x: -1, y: -1 });

    const refreshUserContext = useCallback(async () => {
        try {
            const res = await fetch('/api/ai/context', {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
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

    // Fetch user context on mount
    useEffect(() => {
        refreshUserContext();
    }, [refreshUserContext]);

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
