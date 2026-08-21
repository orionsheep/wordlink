'use client';

import { MODULE_IDS, MODULE_REGISTRY, type ModuleId } from '@/types/modules';
import { useModuleConfig } from '@/context/ModuleConfigContext';
import { moduleLabel } from './ModuleAccordion';
import { useTranslations } from 'next-intl';

export default function GhostBadgesBar() {
  const t = useTranslations('modules');
  const { isModuleVisible, tempExpandModule } = useModuleConfig();
  const hidden = MODULE_IDS.filter((id) => MODULE_REGISTRY[id].tier === 1 && !isModuleVisible(id));
  if (hidden.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-4" aria-label={t('ghost.label')}>
      {hidden.map((id: ModuleId) => (
        <button key={id} type="button" onClick={() => tempExpandModule(id)} className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-blue-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          + {MODULE_REGISTRY[id].badgeText || (() => { try { return t(`${id}.name`); } catch { return moduleLabel(MODULE_REGISTRY[id]); } })()}
        </button>
      ))}
    </div>
  );
}
