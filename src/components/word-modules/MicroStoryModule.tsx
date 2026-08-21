'use client';

import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import ModuleAccordion from './ModuleAccordion';

interface MicroStoryModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function MicroStoryModule({ collapsed, onToggle }: MicroStoryModuleProps) {
  const t = useTranslations('modules');
  return (
    <ModuleAccordion
      meta={MODULE_REGISTRY.micro_story}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900/20 p-6 text-center text-sm text-neutral-500">
        {t('micro_story.placeholder')}
      </div>
    </ModuleAccordion>
  );
}
