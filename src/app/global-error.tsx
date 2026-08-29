'use client';

import { useEffect } from 'react';
import { RotateCcw, AlertOctagon } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Next.js Global Error caught:', error);
  }, [error]);

  const handleHardReset = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
    } catch {}
    reset();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <html lang="zh-CN">
      <body className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center p-6 text-center antialiased">
        <div className="max-w-md w-full p-8 rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 mx-auto">
            <AlertOctagon size={28} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-white tracking-tight">Lexiverse 语宙 系统正在恢复</h2>
            <p className="text-xs text-neutral-400 leading-relaxed">
              {error.message || '系统捕获到渲染异常，点击下方按钮一键重置并恢复。'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleHardReset}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-900/30 transition-all hover:scale-105"
          >
            <RotateCcw size={14} />
            <span>一键恢复系统</span>
          </button>
        </div>
      </body>
    </html>
  );
}
