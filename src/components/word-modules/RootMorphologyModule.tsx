'use client';

import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import ModuleAccordion from './ModuleAccordion';

interface RootMorphologyModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

const PREFIXES = ['counter', 'trans', 'inter', 'under', 'over', 'pre', 're', 'un', 'in', 'im', 'dis'];
const SUFFIXES = ['ization', 'tion', 'ment', 'ness', 'ity', 'able', 'ive', 'ly', 'ing', 'ed', 'er'];

function splitWord(word: string) {
  const lower = word.toLowerCase();
  const prefix = [...PREFIXES].sort((a, b) => b.length - a.length).find((candidate) => lower.startsWith(candidate) && lower.length > candidate.length + 2);
  const suffix = [...SUFFIXES].sort((a, b) => b.length - a.length).find((candidate) => lower.endsWith(candidate) && lower.length > candidate.length + 2);
  if (!prefix && !suffix) return null;
  const start = prefix ? prefix.length : 0;
  const end = suffix ? lower.length - suffix.length : lower.length;
  const root = lower.slice(start, end);
  if (root.length < 2) return null;
  return { prefix, root, suffix };
}

export default function RootMorphologyModule({ word, collapsed, onToggle }: RootMorphologyModuleProps) {
  const t = useTranslations();
  const structure = splitWord(word);
  return (
    <ModuleAccordion
      meta={MODULE_REGISTRY.root_morphology}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-neutral-500">{t('modules.root_morphology.heuristic')}</p>
        {structure ? (
          <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {structure.prefix && <span className="rounded bg-blue-950/60 px-3 py-2 text-blue-300">{structure.prefix}-</span>}
            <span className="rounded bg-neutral-800 px-3 py-2 text-white">{structure.root}</span>
            {structure.suffix && <span className="rounded bg-purple-950/60 px-3 py-2 text-purple-300">-{structure.suffix}</span>}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">{word} · {t('modules.root_morphology.empty')}</p>
        )}
      </div>
    </ModuleAccordion>
  );
}
