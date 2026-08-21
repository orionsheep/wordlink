'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import ModuleAccordion from './ModuleAccordion';

interface MemoryDynamicsModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface StatsResponse {
  stats?: Array<{ word: string; masteryLevel: number; history?: Array<{ date: string; score: number }> }>;
}

export default function MemoryDynamicsModule({ word, currentUserId, collapsed, onToggle }: MemoryDynamicsModuleProps) {
  const t = useTranslations('modules');
  const [stats, setStats] = useState<StatsResponse['stats']>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!currentUserId || collapsed) return;
    let disposed = false;
    const controller = new AbortController();
    fetch(`/api/user/stats?word=${encodeURIComponent(word)}`, { credentials: 'include', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('stats-request-failed');
        return response.json() as Promise<StatsResponse>;
      })
      .then((data) => {
        if (disposed) return;
        setFailed(false);
        setStats(data.stats || []);
      })
      .catch((reason: unknown) => {
        if (disposed || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setFailed(true);
        setStats([]);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [word, currentUserId, collapsed]);

  const current = stats?.find((item) => item.word.toLowerCase() === word.toLowerCase());
  return (
    <ModuleAccordion meta={MODULE_REGISTRY.memory_dynamics} collapsed={collapsed} onToggle={onToggle}>
      {!currentUserId ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4 text-sm text-neutral-500">{t('memory_dynamics.login')}</p>
      ) : failed ? (
        <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-300">{t('memory_dynamics.error')}</p>
      ) : current ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-neutral-500">{t('memory_dynamics.mastery')}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{current.masteryLevel}</p>
            </div>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-neutral-800" aria-label={t('memory_dynamics.mastery')}>
              <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-500" style={{ width: `${Math.min(100, Math.max(0, current.masteryLevel * 10))}%` }} />
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-500">{t('memory_dynamics.realData')}</p>
        </div>
      ) : (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4 text-sm text-neutral-500">{t('memory_dynamics.empty')}</p>
      )}
    </ModuleAccordion>
  );
}
