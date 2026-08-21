'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';
import type { WordModuleProps } from '@/types/modules';
import { MODULE_REGISTRY } from '@/types/modules';
import { useTranslations } from 'next-intl';
import WordTooltip from '@/components/WordTooltip';
import ModuleAccordion from './ModuleAccordion';

interface BasicDefModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
  showTooltip?: boolean;
}

export default function BasicDefModule({ word, chineseData, content, onWordClick, collapsed, onToggle, showTooltip = false, loading = false, error }: BasicDefModuleProps) {
  const t = useTranslations();
  const handleLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const href = event.currentTarget.getAttribute('href');
    if (href?.startsWith('#')) {
      event.preventDefault();
      onWordClick?.(href.slice(1));
    }
  };

  return (
    <ModuleAccordion
      meta={MODULE_REGISTRY.basic_definition}
      collapsed={collapsed}
      onToggle={onToggle}
      className="border-t-0 pt-0"
    >
      <div className="space-y-6" style={{ minHeight: MODULE_REGISTRY.basic_definition.minHeight }}>
        {loading && (
          <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/70 p-4" aria-busy="true" aria-label={t('wordDetail.loading')}>
            <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-800" />
            <div className="h-7 w-4/5 animate-pulse rounded bg-neutral-900" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-900" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-neutral-900" />
          </div>
        )}
        {!loading && error && (
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-300" role="alert">{error}</div>
        )}
        {chineseData && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
            <div className="flex items-center gap-3 text-sm font-mono text-neutral-400">
              <span>/{chineseData.phonetic || chineseData.pronunciation}/</span>
              {Number.isFinite(Number(chineseData.collins)) && Math.floor(Number(chineseData.collins)) > 0 && (
                <span className="text-yellow-500" aria-label={`Collins ${chineseData.collins} stars`}>
                  {'★'.repeat(Math.min(5, Math.floor(Number(chineseData.collins))))}
                </span>
              )}
            </div>
            <p className="mt-2 text-lg font-medium text-neutral-200">{chineseData.concise_definition || t('wordDetail.noDefinition')}</p>
          </div>
        )}

        {content && (
          <div className="prose prose-invert max-w-none prose-headings:font-light prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-p:leading-relaxed prose-strong:text-yellow-200 prose-strong:font-bold prose-em:text-neutral-300">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              rehypePlugins={[rehypeRaw]}
              components={{
                a: ({ ...props }) => <InlineWordLink {...props} onClick={handleLinkClick} showTooltip={showTooltip} />,
                small: ({ ...props }) => <span {...props} className="ml-1 mr-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500" />,
                p: ({ ...props }) => <div {...props} className="mb-2 leading-7 text-neutral-300" />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}

        {chineseData?.forms && Object.keys(chineseData.forms).length > 0 && (
          <div>
            <h3 className="mb-3 text-lg font-semibold text-white">{t('wordDetail.wordForms')}</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(chineseData.forms).map(([key, value]) => (
                <div key={key} className="rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-2">
                  <span className="mr-2 text-xs font-bold uppercase tracking-wider text-neutral-500">{key}</span>
                  <span className="font-medium text-neutral-200">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {chineseData?.definitions?.length ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">{t('wordDetail.detailedDefinitions')}</h3>
            {chineseData.definitions.map((definition, index) => (
              <article key={`${definition.pos}-${index}`} className="rounded-lg border border-neutral-800/70 bg-neutral-900/30 p-4">
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-neutral-400">{definition.pos}</span>
                <p className="mt-2 text-neutral-200">{definition.explanation_en}</p>
                <p className="mt-1 text-sm text-neutral-500">{definition.explanation_cn}</p>
                <div className="mt-3 border-l-2 border-neutral-700 pl-3">
                  <p className="italic text-neutral-300">&quot;{definition.example_en}&quot;</p>
                  <p className="text-sm text-neutral-500">{definition.example_cn}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {chineseData?.comparison?.length ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">{t('wordDetail.comparisons')}</h3>
            {chineseData.comparison.map((comparison, index) => (
              <article key={`${comparison.word_to_compare}-${index}`} className="rounded-lg border border-neutral-800/70 bg-neutral-900/30 p-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-purple-400">{comparison.word_to_compare}</span>
                  <span className="text-sm text-neutral-500">vs {word}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">{comparison.analysis}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </ModuleAccordion>
  );
}

interface InlineWordLinkProps {
  href?: string;
  children?: ReactNode;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  showTooltip: boolean;
  [key: string]: unknown;
}

function InlineWordLink({ href, children, onClick, showTooltip, ...props }: InlineWordLinkProps) {
  const [hovered, setHovered] = useState(false);
  const [tooltip, setTooltip] = useState<{ phonetic?: string; translation?: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleEnter = () => {
    setHovered(true);
    if (!showTooltip || tooltip || !href?.startsWith('#')) return;
    timerRef.current = setTimeout(() => {
      fetch(`/api/words/${encodeURIComponent(href.slice(1))}`)
        .then((response) => response.ok ? response.json() as Promise<{ chinese?: { phonetic?: string; pronunciation?: string; concise_definition?: string } }> : null)
        .then((data) => {
          if (data?.chinese) setTooltip({ phonetic: data.chinese.phonetic || data.chinese.pronunciation, translation: data.chinese.concise_definition });
        })
        .catch(() => undefined);
    }, 300);
  };

  return (
    <span className="relative inline-block" onMouseEnter={handleEnter} onMouseLeave={() => { setHovered(false); if (timerRef.current) clearTimeout(timerRef.current); }}>
      <a {...props} href={href} onClick={onClick} className="cursor-pointer text-blue-400 transition-colors hover:text-blue-300">{children}</a>
      {showTooltip && hovered && tooltip && <WordTooltip phonetic={tooltip.phonetic} translation={tooltip.translation} className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2" />}
    </span>
  );
}
