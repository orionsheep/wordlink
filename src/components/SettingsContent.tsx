'use client';

import React, { useState, useEffect } from 'react';
import { Blocks, Keyboard, Settings as SettingsIcon, RotateCcw, Lock, ChevronDown, ChevronUp, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useModuleConfig } from '@/context/ModuleConfigContext';
import { MODULE_REGISTRY, BUILTIN_PRESET_MODES, type PresetMode } from '@/types/modules';
import { useDeviceType } from '@/lib/hooks';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from './LanguageSwitcher';
import FullscreenButton from './FullscreenButton';

export default function SettingsContent() {
    const t = useTranslations();
    const { groupSize, showChinese, showScore, showHoverTooltip, showWordDetailTooltip, showGraphTooltip, shortcuts, layoutMode, updateSettings, resetShortcuts } = useSettings();
    const deviceType = useDeviceType();
    const isTablet = deviceType === 'tablet';
    const { preset, modules, collapsedModules, moduleOrder, setPreset, toggleModule, toggleCollapse, moveModule, resetToDefault } = useModuleConfig();
    const [draggedSettingIndex, setDraggedSettingIndex] = useState<number | null>(null);
    const [dragOverSettingIndex, setDragOverSettingIndex] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'modules'>('general');
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
        <div className="flex h-full min-w-0 flex-col sm:flex-row">
            {/* Sidebar */}
            <div className="flex w-full shrink-0 gap-2 overflow-x-auto border-b border-neutral-800 p-3 sm:w-48 sm:flex-col sm:gap-2 sm:overflow-x-visible sm:border-b-0 sm:border-r sm:p-4">
                <h2 className="mb-2 hidden shrink-0 px-2 text-xl font-bold text-white sm:mb-6 sm:block">{t('settings.title')}</h2>

                <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'general'
                        ? 'bg-blue-600 text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    <SettingsIcon size={18} />
                    {t('settings.general')}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('shortcuts')}
                    className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'shortcuts'
                        ? 'bg-blue-600 text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    <Keyboard size={18} />
                    {t('settings.shortcuts')}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('modules')}
                    className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'modules'
                        ? 'bg-blue-600 text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                        }`}
                >
                    <Blocks size={18} />
                    {t('settings.modules')}
                </button>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
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
                ) : activeTab === 'modules' ? (
                    <div className="max-w-3xl space-y-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white">{t('settings.moduleCockpit')}</h3>
                                <p className="mt-1 text-sm text-neutral-500">{t('settings.moduleCockpitDescription')}</p>
                            </div>
                            <button type="button" onClick={resetToDefault} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                <RotateCcw size={13} aria-hidden="true" />
                                {t('settings.restoreModuleDefaults')}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3" role="radiogroup" aria-label={t('settings.modulePresets')}>
                            {BUILTIN_PRESET_MODES.map((mode: PresetMode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={preset === mode}
                                    onClick={() => setPreset(mode)}
                                    className={`rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${preset === mode ? 'border-blue-500 bg-blue-600/20 text-white' : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700 hover:text-white'}`}
                                >
                                    <span className="block text-sm font-semibold">{t(`settings.presets.${mode}.name`)}</span>
                                    <span className="mt-1 block text-xs text-neutral-500">{t(`settings.presets.${mode}.description`)}</span>
                                </button>
                            ))}
                        </div>

                        {preset === 'custom' && <p className="rounded-md border border-violet-900/50 bg-violet-950/20 px-3 py-2 text-xs text-violet-300">{t('settings.customMode')}</p>}

                        <div className="space-y-3">
                            {moduleOrder.map((id, index) => {
                                const meta = MODULE_REGISTRY[id];
                                const enabled = meta.tier === 0 || modules[id];
                                return (
                                    <div
                                        key={id}
                                        draggable
                                        onDragStart={() => setDraggedSettingIndex(index)}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            if (dragOverSettingIndex !== index) setDragOverSettingIndex(index);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (draggedSettingIndex !== null && draggedSettingIndex !== index) {
                                                moveModule(draggedSettingIndex, index);
                                            }
                                            setDraggedSettingIndex(null);
                                            setDragOverSettingIndex(null);
                                        }}
                                        onDragEnd={() => {
                                            setDraggedSettingIndex(null);
                                            setDragOverSettingIndex(null);
                                        }}
                                        className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-all duration-200 ${
                                            draggedSettingIndex === index ? 'opacity-30 scale-[0.98]' : ''
                                        } ${dragOverSettingIndex === index ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-800 bg-neutral-900/40'}`}
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex flex-col gap-0.5 text-neutral-600">
                                                <button
                                                    type="button"
                                                    disabled={index === 0}
                                                    onClick={() => moveModule(index, index - 1)}
                                                    className="p-0.5 rounded hover:text-neutral-300 disabled:opacity-20 disabled:hover:text-neutral-600 transition-colors"
                                                    title={t('common.previous') || 'Move Up'}
                                                >
                                                    <ArrowUp size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={index === moduleOrder.length - 1}
                                                    onClick={() => moveModule(index, index + 1)}
                                                    className="p-0.5 rounded hover:text-neutral-300 disabled:opacity-20 disabled:hover:text-neutral-600 transition-colors"
                                                    title={t('common.next') || 'Move Down'}
                                                >
                                                    <ArrowDown size={13} />
                                                </button>
                                            </div>
                                            <div className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-300 p-0.5">
                                                <GripVertical size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-sm font-medium text-neutral-200">{t(`modules.${meta.name}`)}</p>
                                                    {meta.badgeText && <span className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[9px] font-mono text-neutral-500">{meta.badgeText}</span>}
                                                </div>
                                                <p className="mt-1 text-xs leading-relaxed text-neutral-500">{t(`modules.${meta.description}`)}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <button type="button" onClick={() => toggleCollapse(id)} aria-label={collapsedModules[id] ? t('settings.expandModule') : t('settings.collapseModule')} className="rounded-md border border-neutral-800 p-1.5 text-neutral-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                                {collapsedModules[id] ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
                                            </button>
                                            <label className={`relative inline-flex items-center ${meta.tier === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    disabled={meta.tier === 0}
                                                    onChange={() => toggleModule(id)}
                                                    className="peer sr-only"
                                                    aria-label={t(`modules.${meta.name}`)}
                                                />
                                                <span className={`relative h-6 w-11 rounded-full transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${enabled ? 'bg-blue-600' : 'bg-neutral-700'}`}>
                                                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </span>
                                                {meta.tier === 0 && <Lock size={12} className="ml-1.5 text-neutral-600" aria-label={t('settings.coreModuleLocked')} />}
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
