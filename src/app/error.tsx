'use client';

import { useEffect } from 'react';
import { RotateCcw, AlertOctagon, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Next.js Page Level Error caught:', error);
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
    <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="glass-card max-w-lg w-full p-8 rounded-3xl border border-neutral-800 bg-neutral-950/80 shadow-2xl space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 mx-auto shadow-inner">
          <AlertOctagon size={28} />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-white tracking-tight">Lexiverse 语宙 遇到异常</h2>
          <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
            {error.message || '前端渲染发生未捕获的错误，已为您自动拦截。'}
          </p>
          {error.digest && (
            <p className="text-[10px] font-mono text-neutral-600">Digest: {error.digest}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleHardReset}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-900/30 transition-all hover:scale-105"
          >
            <RotateCcw size={14} />
            <span>清理缓存并重载</span>
          </button>
          <Link
            href="/study"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all"
          >
            <Home size={14} />
            <span>返回首页</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
