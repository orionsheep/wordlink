'use client';

import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import ModuleAccordion from './ModuleAccordion';

interface VisualMnemonicModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function VisualMnemonicModule({ collapsed, onToggle }: VisualMnemonicModuleProps) {
  const t = useTranslations('modules');
  return (
    <ModuleAccordion
      meta={MODULE_REGISTRY.visual_mnemonic}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <div data-module="visual_mnemonic" className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900/20 p-6 text-center text-sm text-neutral-500">
        {t('visual_mnemonic.placeholder')}
      </div>
    </ModuleAccordion>
  );
}
