'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Compass, Loader2, Route, Sparkles } from 'lucide-react';

interface Hop {
    from: string;
    to: string;
    relation: string;
}

interface NavigatorResponse {
    found: boolean;
    direct?: boolean;
    target?: string;
    path?: Hop[];
    hops?: number;
    explanation?: string;
    knownSeedCount?: number;
    message?: string;
}

function renderMarkdown(text: string) {
    return text.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('###')) {
            return (
                <h3 key={i} className="mt-4 mb-1 text-sm font-semibold text-cyan-300">
                    {trimmed.replace(/^#+\s*/, '')}
                </h3>
            );
        }
        if (trimmed.startsWith('-')) {
            return (
                <li
                    key={i}
                    className="ml-5 list-disc text-sm leading-relaxed text-neutral-300"
                    dangerouslySetInnerHTML={{
                        __html: trimmed
                            .slice(1)
                            .trim()
                            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>'),
                    }}
                />
            );
        }
        return (
            <p key={i} className="text-sm leading-relaxed text-neutral-300">
                {trimmed}
            </p>
        );
    });
}

export default function NavigatorPage() {
    // 鏅鸿兘杩斿洖锛氫粠鍝潵鍥炲摢鍘伙紙涓诲簲鐢?dashboard 鍧囧彲杩涘叆锛?//   涓嶅啀鍐欐鍥?dashboard锛夛紝鏃犳潵璺椂鍥炰富鐣岄潰
    const t = useTranslations('navigator');
    const [target, setTarget] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'notfound' | 'error'>('idle');
    const [result, setResult] = useState<NavigatorResponse | null>(null);

    const navigate = (word: string) => {
        const clean = word.trim();
        if (!clean) return;
        setStatus('loading');
        setResult(null);
        fetch('/api/ai/navigator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ target: clean }),
        })
            .then(async (res) => {
                if (!res.ok) throw new Error('failed');
                return res.json() as Promise<NavigatorResponse>;
            })
            .then((data) => {
                setResult(data);
                setStatus(data.found ? 'done' : 'notfound');
            })
            .catch(() => setStatus('error'));
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
            <div className="mx-auto max-w-2xl px-4 py-10">
                {/* Hero */}
                <div className="mb-8 text-center">
                    <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-800/60 bg-cyan-950/40">
                        <Compass className="h-7 w-7 text-cyan-400" />
                    </div>
                    <h1 className="text-2xl font-bold">{t('title')}</h1>
                    <p className="mt-2 text-sm text-neutral-500">{t('subtitle')}</p>
                </div>

                {/* Input */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        navigate(target);
                    }}
                    className="flex gap-2"
                >
                    <input
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        placeholder={t('placeholder')}
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm outline-none transition focus:border-cyan-600"
                    />
                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="flex items-center gap-2 rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-medium transition hover:bg-cyan-600 disabled:opacity-50"
                    >
                        {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                        {t('find')}
                    </button>
                </form>

                {status === 'loading' && (
                    <div className="mt-8 flex items-center justify-center gap-3 text-sm text-neutral-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t('searching')}
                    </div>
                )}

                {status === 'error' && (
                    <div className="mt-8 rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-300">{t('error')}</div>
                )}

                {status === 'notfound' && result && (
                    <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900/40 p-6 text-center text-sm text-neutral-400">
                        {result.message || t('notFound')}
                    </div>
                )}

                {status === 'done' && result?.found && (
                    <div className="mt-8 space-y-6">
                        {/* Path stepper */}
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
                            <div className="mb-4 flex items-center justify-between text-xs text-neutral-500">
                                <span>{t('routeFound')}</span>
                                <span>
                                    {result.hops} hop{result.hops === 1 ? '' : 's'} 路 {result.knownSeedCount} seeds
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-y-3">
                                {result.path!.map((hop, i) => (
                                    <span key={i} className="flex items-center">
                                        {i > 0 && <ArrowRight className="mx-2 h-4 w-4 shrink-0 text-cyan-600" />}
                                        <Link
                                            href={`/word/${encodeURIComponent(i === 0 ? hop.from : hop.from)}`}
                                            className={`rounded-full border px-3 py-1 text-sm transition ${
                                                i === 0
                                                    ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
                                                    : 'border-neutral-700 bg-neutral-800/60 text-neutral-200 hover:border-cyan-600 hover:text-cyan-300'
                                            }`}
                                        >
                                            {hop.from}
                                        </Link>
                                    </span>
                                ))}
                                <ArrowRight className="mx-2 h-4 w-4 shrink-0 text-cyan-600" />
                                <Link
                                    href={`/word/${encodeURIComponent(result.target!)}`}
                                    className="rounded-full border border-cyan-500 bg-cyan-950/60 px-4 py-1.5 text-sm font-semibold text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.25)]"
                                >
                                    馃幆 {result.target}
                                </Link>
                            </div>
                        </div>

                        {/* AI explanation */}
                        {result.explanation && (
                            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400">
                                    <Sparkles className="h-3.5 w-3.5" /> AI Coaching Brief
                                </div>
                                {renderMarkdown(result.explanation)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
