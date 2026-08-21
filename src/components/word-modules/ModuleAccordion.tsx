'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, BookOpen, ChevronDown, GripVertical, Image as ImageIcon, Network, PlayCircle, Sparkles, StickyNote, Volume2 } from 'lucide-react';
import type { ModuleMeta } from '@/types/modules';

const icons = {
  'book-open': BookOpen,
  'volume-2': Volume2,
  network: Network,
  'play-circle': PlayCircle,
  image: ImageIcon,
  sparkles: Sparkles,
  'sticky-note': StickyNote,
  activity: Activity,
} as const;

const fallbackLabels: Record<ModuleMeta['id'], string> = {
  basic_definition: 'Definition / 定义',
  audio_speech: 'Pronunciation / 发音',
  root_morphology: 'Word structure / 词根结构',
  youtube_clips: 'Usage clips / 语境视频',
  visual_mnemonic: 'Visual mnemonic / 视觉记忆',
  micro_story: 'Micro story / 微故事',
  community_notes: 'Community notes / 社区笔记',
  memory_dynamics: 'Memory dynamics / 记忆动态',
};

export function moduleLabel(meta: ModuleMeta): string {
  return fallbackLabels[meta.id] || meta.name;
}

function translated(t: ReturnType<typeof useTranslations>, key: string, fallback: string): string {
  try {
    return t(key);
  } catch {
    return fallback;
  }
}

interface ModuleAccordionProps {
  meta: ModuleMeta;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
}

export default function ModuleAccordion({
  meta,
  collapsed,
  onToggle,
  children,
  className = '',
  action,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDragOver,
}: ModuleAccordionProps) {
  const t = useTranslations('modules');
  const Icon = icons[meta.icon as keyof typeof icons] || BookOpen;
  const contentId = `word-module-${meta.id}-content`;
  const title = translated(t, `${meta.id}.name`, moduleLabel(meta));
  const badge = meta.badgeText;

  return (
    <section
      id={`word-module-${meta.id}`}
      data-module={meta.id}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`border-t border-neutral-800 pt-6 transition-all duration-200 ${isDragging ? 'opacity-30 scale-[0.98]' : ''} ${isDragOver ? 'border-t-2 border-t-blue-500 bg-blue-500/5' : ''} ${className}`}
      style={{ minHeight: meta.minHeight }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {onDragStart && (
            <div
              className="cursor-grab text-neutral-600 hover:text-neutral-300 active:cursor-grabbing p-0.5 rounded transition-colors"
              title="Drag to reorder / 拖动以调整模块顺序"
            >
              <GripVertical size={16} />
            </div>
          )}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={contentId}
            onClick={onToggle}
            className="group flex min-w-0 items-center gap-2 rounded text-left text-xl font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Icon size={18} className="shrink-0 text-blue-400" aria-hidden="true" />
            <span className="truncate">{title}</span>
            {badge && <span className="rounded border border-neutral-700/80 bg-neutral-900 px-1.5 py-0.5 text-[9px] font-mono text-neutral-400">{badge}</span>}
            <ChevronDown size={16} className={`shrink-0 text-neutral-500 transition-transform duration-[250ms] group-hover:text-neutral-300 ${collapsed ? '-rotate-90' : ''}`} aria-hidden="true" />
          </button>
        </div>
        {action}
      </div>
      <div
        id={contentId}
        className={`grid transition-[grid-template-rows,opacity] duration-[250ms] ease-out ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
        aria-hidden={collapsed}
      >
        <div className="min-h-0 overflow-hidden" inert={collapsed || undefined}>
          {children}
        </div>
      </div>
    </section>
  );
}
