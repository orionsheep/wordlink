'use client';

import React, { useState, useEffect } from 'react';
import { Keyboard, Settings as SettingsIcon, RotateCcw } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useDeviceType } from '@/lib/hooks';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from './LanguageSwitcher';
import FullscreenButton from './FullscreenButton';

export default function SettingsContent() {
    const t = useTranslations();
    const { groupSize, showChinese, showScore, showHoverTooltip, showWordDetailTooltip, showGraphTooltip, shortcuts, layoutMode, updateSettings, resetShortcuts } = useSettings();
    const deviceType = useDeviceType();
    const isTablet = deviceType === 'tablet';
    const [activeTab, setActiveTab] = useState<'general' | 'shortcuts'>('general');
    const [recordingKey, setRecordingKey] = useState<string | null>(null);

    // Handle key recording
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (recordingKey) {
                e.preventDefault();
                e.stopPropagation();

                if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

                const newKey = e.key.toLowerCase() === ' ' ? ' ' : e.key.toLowerCase();

                updateSettings({
                    shortcuts: {
                        ...shortcuts,
                        [recordingKey]: newKey
                    }
                });
                setRecordingKey(null);
            }
        };

        if (recordingKey) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [recordingKey, shortcuts, updateSettings]);

    const formatKey = (key: string) => {
        if (key === ' ') return 'Space';
        return key.toUpperCase();
    };

    return (
        <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-48 border-r border-neutral-800 p-4 flex flex-col gap-2">
                <h2 className="text-xl font-bold text-white mb-6 px-2">{t('settings.title')}</h2>

                <button
                    onClick={() => setActiveTab('general')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'general'
                        ? 'bg-blue-600 text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    <SettingsIcon size={18} />
                    {t('settings.general')}
                </button>
                <button
                    onClick={() => setActiveTab('shortcuts')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'shortcuts'
                        ? 'bg-blue-600 text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    <Keyboard size={18} />
                    {t('settings.shortcuts')}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-8 overflow-y-auto">
                {activeTab === 'general' ? (
                    <div className="space-y-8 max-w-md">
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4">{t('settings.appearance')}</h3>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                                        {t('settings.language')}
                                    </label>
                                    <LanguageSwitcher />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-2">
                                        {t('settings.groupSize')}
                                    </label>
                                    <input
                                        type="number"
                                        value={groupSize}
                                        onChange={(e) => updateSettings({ groupSize: Math.max(1, parseInt(e.target.value) || 100) })}
                                        className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none transition-colors"
                                    />
                                </div>

                                <div className="space-y-4 pt-2">
                                    <label className="flex items-center justify-between cursor-pointer group">
                                        <span className="text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">
                                            {t('settings.showChinese')}
                                        </span>
                                        <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                            <input
                                                type="checkbox"
                                                checked={showChinese}
                                                onChange={(e) => updateSettings({ showChinese: e.target.checked })}
                                                className="toggle-checkbox absolute block w-4 h-4 mt-1 ml-1 bg-white rounded-full appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-4"
                                            />
                                            <div className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${showChinese ? 'bg-blue-600' : 'bg-neutral-700'}`}></div>
                                        </div>
                                    </label>

                                    <label className="flex items-center justify-between cursor-pointer group">
                                        <span className="text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">
                                            {t('settings.showScore')}
                                        </span>
                                        <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                            <input
                                                type="checkbox"
                                                checked={showScore}
                                                onChange={(e) => updateSettings({ showScore: e.target.checked })}
                                                className="toggle-checkbox absolute block w-4 h-4 mt-1 ml-1 bg-white rounded-full appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-4"
                                            />
                                            <div className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${showScore ? 'bg-blue-600' : 'bg-neutral-700'}`}></div>
                                        </div>
                                    </label>

                                    <label className="flex items-center justify-between cursor-pointer group">
                                        <span className="text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">
                                            {t('settings.showHoverTooltip')}
                                        </span>
                                        <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                            <input
                                                type="checkbox"
                                                checked={showHoverTooltip}
                                                onChange={(e) => updateSettings({ showHoverTooltip: e.target.checked })}
                                                className="toggle-checkbox absolute block w-4 h-4 mt-1 ml-1 bg-white rounded-full appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-4"
                                            />
                                            <div className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${showHoverTooltip ? 'bg-blue-600' : 'bg-neutral-700'}`}></div>
                                        </div>
                                    </label>

                                    {showHoverTooltip && (
                                        <div className="ml-4 pl-4 border-l border-neutral-700 space-y-4">
                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <span className="text-xs font-medium text-neutral-400 group-hover:text-white transition-colors">
                                                    {t('settings.showWordDetailTooltip')}
                                                </span>
                                                <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                                    <input
                                                        type="checkbox"
                                                        checked={showWordDetailTooltip}
                                                        onChange={(e) => updateSettings({ showWordDetailTooltip: e.target.checked })}
                                                        className="toggle-checkbox absolute block w-4 h-4 mt-1 ml-1 bg-white rounded-full appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-4"
                                                    />
                                                    <div className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${showWordDetailTooltip ? 'bg-blue-600' : 'bg-neutral-700'}`}></div>
                                                </div>
                                            </label>

                                            <label className="flex items-center justify-between cursor-pointer group">
                                                <span className="text-xs font-medium text-neutral-400 group-hover:text-white transition-colors">
                                                    {t('settings.showGraphTooltip')}
                                                </span>
                                                <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                                    <input
                                                        type="checkbox"
                                                        checked={showGraphTooltip}
                                                        onChange={(e) => updateSettings({ showGraphTooltip: e.target.checked })}
                                                        className="toggle-checkbox absolute block w-4 h-4 mt-1 ml-1 bg-white rounded-full appearance-none cursor-pointer transition-transform duration-200 ease-in-out checked:translate-x-4"
                                                    />
                                                    <div className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ${showGraphTooltip ? 'bg-blue-600' : 'bg-neutral-700'}`}></div>
                                                </div>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4">{t('settings.display')}</h3>
                            <div className="space-y-4">
                                <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                                    <p className="text-sm text-neutral-400 mb-3">
                                        {t('settings.fullscreenDescription')}
                                    </p>
                                    <FullscreenButton />
                                </div>
                            </div>
                        </div>

                        {isTablet && (
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-4">{t('settings.layoutMode')}</h3>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => updateSettings({ layoutMode: 'mobile' })}
                                        className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors border ${layoutMode === 'mobile'
                                            ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                            : 'bg-neutral-900/50 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
                                        }`}
                                    >
                                        {t('settings.mobile')}
                                    </button>
                                    <button
                                        onClick={() => updateSettings({ layoutMode: 'desktop' })}
                                        className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors border ${layoutMode === 'desktop'
                                            ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                            : 'bg-neutral-900/50 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
                                        }`}
                                    >
                                        {t('settings.desktop')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : activeTab === 'shortcuts' ? (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-white">{t('settings.shortcuts')}</h3>
                            <button
                                onClick={resetShortcuts}
                                className="flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-neutral-800"
                            >
                                <RotateCcw size={14} />
                                {t('settings.resetShortcuts')}
                            </button>
                        </div>

                        <div className="grid gap-4">
                            {Object.entries(shortcuts).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg hover:border-neutral-700 transition-colors">
                                    <span className="text-sm text-neutral-300 font-medium">
                                        {t(`settings.shortcutLabels.${key}`)}
                                    </span>
                                    <button
                                        onClick={() => setRecordingKey(key)}
                                        className={`min-w-[80px] px-3 py-1.5 rounded text-xs font-mono font-bold transition-all ${recordingKey === key
                                            ? 'bg-blue-600 text-white animate-pulse scale-105'
                                            : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                                            }`}
                                    >
                                        {recordingKey === key ? t('settings.recordingKey') : formatKey(value)}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
