'use client';

import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import ModuleAccordion from './ModuleAccordion';

interface AudioSpeechModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
  compact?: boolean;
  onPlayYouTubeAudio?: () => void;
  isYouTubePlaying?: boolean;
}

export default function AudioSpeechModule({ onPlayAudio, onPlayYouTubeAudio, isYouTubePlaying, audioShortcuts, collapsed, onToggle, compact = false }: AudioSpeechModuleProps) {
  const t = useTranslations();
  const buttons = (['US', 'UK'] as const).map((type) => {
    const shortcut = type === 'US' ? audioShortcuts?.us : audioShortcuts?.uk;
    const label = type === 'US' ? t('wordDetail.usPronunciation') : t('wordDetail.ukPronunciation');
    return (
      <button
        key={type}
        type="button"
        aria-label={`${label}${shortcut ? ` (${shortcut.toUpperCase()})` : ''}`}
        onClick={() => onPlayAudio?.(type)}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 transition-colors hover:border-blue-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className={type === 'US' ? 'font-bold text-blue-400' : 'font-bold text-purple-400'}>{type}</span>
        <Volume2 size={14} aria-hidden="true" />
        {shortcut && <span className="font-mono text-[10px] text-neutral-500">[{shortcut.toUpperCase()}]</span>}
      </button>
    );
  });

  const ytShortcut = audioShortcuts?.youtube;
  const youtubeButton = onPlayYouTubeAudio && (
    <button
      key="YT"
      type="button"
      aria-label={`YouTube ${t('settings.youtubeAudio')}${ytShortcut ? ` (${ytShortcut.toUpperCase()})` : ''}`}
      onClick={onPlayYouTubeAudio}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
        isYouTubePlaying
          ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-900/30 font-semibold'
          : 'bg-neutral-900 border-neutral-800 text-red-400 hover:border-red-500/50 hover:text-white'
      }`}
      title={t('settings.youtubeAudio')}
    >
      <span className="font-bold text-red-500">YT</span>
      <Volume2 size={14} aria-hidden="true" />
      {ytShortcut && <span className="font-mono text-[10px] text-neutral-500">[{ytShortcut.toUpperCase()}]</span>}
    </button>
  );

  const controls = (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('wordDetail.pronunciation')}>
      {buttons}
      {youtubeButton}
      {!compact && <span className="text-[11px] text-neutral-500">{t('wordDetail.audioFallbackChain')}</span>}
    </div>
  );

  if (compact) return controls;
  return (
    <ModuleAccordion meta={MODULE_REGISTRY.audio_speech} collapsed={collapsed} onToggle={onToggle}>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">{controls}</div>
    </ModuleAccordion>
  );
}
