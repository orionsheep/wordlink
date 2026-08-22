'use client';

import { ImageIcon } from 'lucide-react';

/**
 * 媒体素材占位面板:当素材 URL 为空时渲染,
 * 提示此处为素材位,规格见 docs/媒体素材需求文档.md。
 */
export default function MediaPlaceholder({
  label,
  aspectClass = 'aspect-video',
}: {
  label: string;
  aspectClass?: string;
}) {
  return (
    <div
      className={`liquid-glass flex w-full flex-col items-center justify-center gap-3 text-center ${aspectClass}`}
    >
      <ImageIcon className="h-8 w-8 text-white/30" strokeWidth={1.5} />
      <p className="px-6 text-sm uppercase tracking-widest text-white/40">{label}</p>
      <p className="text-xs text-white/25">素材待接入 · 见媒体素材需求文档</p>
    </div>
  );
}
