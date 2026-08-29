'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Award, Printer, Loader2, Fingerprint } from 'lucide-react';

interface RadarPoint {
    dimension: string;
    label: string;
    labelZh: string;
    score: number;
}

interface PassportPayload {
    empty?: boolean;
    metrics: {
        uniqueWordsVisited: number;
        uniqueWordsTested: number;
        totalTests: number;
        accuracy: number;
        avgMemoryStrength: number;
        masteredWords: number;
        dueForReview: number;
        checkinDays: number;
        streakDays: number;
        totalDwellMinutes: number;
        audioPlays: number;
    };
    radar: RadarPoint[];
    cefr: string;
    narrative: string;
    generatedAt: string;
}

/** Lightweight dependency-free SVG radar chart. */
function RadarChart({ points }: { points: RadarPoint[] }) {
    const size = 320;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 118;
    const n = points.length;
    const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
    const pointAt = (i: number, r: number) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
    const polygon = points
        .map((p, i) => pointAt(i, (Math.max(4, p.score) / 100) * radius).join(','))
        .join(' ');

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[340px]">
            {[25, 50, 75, 100].map((ring) => (
                <polygon
                    key={ring}
                    points={points.map((_, i) => pointAt(i, (ring / 100) * radius).join(',')).join(' ')}
                    fill="none"
                    stroke="#3f3f46"
                    strokeWidth="1"
                />
            ))}
            {points.map((_, i) => {
                const [x, y] = pointAt(i, radius);
                return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#3f3f46" strokeWidth="1" />;
            })}
            <polygon points={polygon} fill="rgba(139,92,246,0.28)" stroke="#8b5cf6" strokeWidth="2" />
            {points.map((p, i) => {
                const [x, y] = pointAt(i, (Math.max(4, p.score) / 100) * radius);
                return <circle key={i} cx={x} cy={y} r="3.5" fill="#a78bfa" />;
            })}
            {points.map((p, i) => {
                const [x, y] = pointAt(i, radius + 22);
                return (
                    <text
                        key={p.dimension}
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="11"
                        fill="#a1a1aa"
                    >
                        {p.labelZh || p.label} 路 {p.score}
                    </text>
                );
            })}
        </svg>
    );
}

export default function PassportPage() {
    const t = useTranslations('passport');

    // 鏅鸿兘杩斿洖锛氫粠鍝潵鍥炲摢鍘伙紙dashboard/涓诲簲鐢ㄥ潎鍙繘鍏ワ級锛屾棤鏉ヨ矾鏃跺洖涓荤晫闈?
    const [data, setData] = useState<PassportPayload | null>(null);
    const [isEmpty, setIsEmpty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/ai/passport', { credentials: 'include' })
            .then(async (res) => {
                if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : 'failed');
                return res.json() as Promise<PassportPayload>;
            })
            .then((payload) => {
                if (payload.empty) {
                    setIsEmpty(true);
                } else {
                    setData(payload);
                }
            })
            .catch((reason: unknown) => setError(reason instanceof Error && reason.message === 'unauthorized' ? 'auth' : 'fail'))
            .finally(() => setLoading(false));
    }, []);

    const renderNarrative = (text: string) =>
        text.split('\n').map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('###')) {
                return (
                    <h3 key={i} className="mt-5 mb-1 text-base font-semibold text-violet-300">
                        {trimmed.replace(/^#+\s*/, '')}
                    </h3>
                );
            }
            if (trimmed.startsWith('-')) {
                return (
                    <li key={i} className="ml-5 list-disc text-sm leading-relaxed text-neutral-300">
                        {trimmed.slice(1).trim()}
                    </li>
                );
            }
            return (
                <p key={i} className="text-sm leading-relaxed text-neutral-300">
                    {trimmed}
                </p>
            );
        });

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
            {/* Top bar */}
            <div className="flex items-center justify-end border-b border-neutral-800 px-4 py-3 print:hidden">
                {data && (
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 transition hover:border-violet-500 hover:text-violet-300"
                    >
                        <Printer className="h-3.5 w-3.5" /> {t('print')}
                    </button>
                )}
            </div>

            <div className="mx-auto max-w-3xl px-4 py-8">
                {loading && (
                    <div className="flex items-center justify-center gap-3 py-32 text-neutral-400">
                        <Loader2 className="h-5 w-5 animate-spin" /> {t('loading')}
                    </div>
                )}

                {isEmpty && (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-10 text-center">
                        <Award className="mx-auto mb-4 h-12 w-12 text-neutral-700" />
                        <h2 className="text-lg font-semibold text-white">{t('onboardingTitle')}</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-500">{t('onboardingDesc')}</p>
                        <Link
                            href="/quiz"
                            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-medium transition hover:bg-violet-600"
                        >
                            {t('startQuiz')}
                        </Link>
                    </div>
                )}

                {error === 'auth' && (
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-8 text-center text-neutral-400">
                        {t('loginRequired')}
                        <Link href="/login" className="ml-2 text-violet-400 underline underline-offset-2">
                            {t('signIn')}
                        </Link>
                    </div>
                )}
                {error === 'fail' && (
                    <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-8 text-center text-amber-300">{t('error')}</div>
                )}

                {data && !isEmpty && (
                    <div className="overflow-hidden rounded-2xl border border-violet-900/40 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-[0_0_60px_rgba(139,92,246,0.08)]">
                        {/* Certificate header */}
                        <div className="border-b border-violet-900/30 px-8 py-6 text-center">
                            <div className="mb-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-400">
                                <Fingerprint className="h-4 w-4" /> United Nations 路 SDG 4
                            </div>
                            <h1 className="text-2xl font-bold tracking-wide">{t('title')}</h1>
                            <p className="mt-1 text-xs text-neutral-500">{t('subtitle')}</p>
                            <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-violet-700/60 bg-violet-950/40 px-6 py-2">
                                <span className="text-xs uppercase tracking-widest text-neutral-400">CEFR</span>
                                <span className="text-3xl font-black text-violet-300">{data.cefr}</span>
                            </div>
                        </div>

                        <div className="grid gap-6 px-8 py-6 md:grid-cols-2">
                            {/* Radar */}
                            <div>
                                <RadarChart points={data.radar} />
                            </div>
                            {/* Key metrics */}
                            <div className="grid grid-cols-2 content-center gap-3">
                                {[
                                    { v: data.metrics.uniqueWordsTested, l: t('wordsTested') },
                                    { v: `${data.metrics.accuracy}%`, l: t('accuracy') },
                                    { v: data.metrics.masteredWords, l: t('mastered') },
                                    { v: `${data.metrics.streakDays}${t('dayUnit')}`, l: t('streak') },
                                    { v: data.metrics.totalDwellMinutes, l: t('minutes') },
                                    { v: data.metrics.audioPlays, l: t('audioPlays') },
                                ].map((m) => (
                                    <div key={m.l} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-center">
                                        <p className="text-xl font-bold text-white">{m.v}</p>
                                        <p className="mt-0.5 text-[11px] text-neutral-500">{m.l}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* AI narrative */}
                        {data.narrative ? (
                            <div className="border-t border-neutral-800/70 px-8 py-6">
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-violet-400">
                                    <Award className="h-4 w-4" /> XAI Narrative
                                </div>
                                {renderNarrative(data.narrative)}
                            </div>
                        ) : (
                            <div className="border-t border-neutral-800/70 px-8 py-4 text-center text-xs text-neutral-500">{t('narrativeUnavailable')}</div>
                        )}

                        <div className="border-t border-neutral-800/70 px-8 py-4 text-center text-[11px] text-neutral-600">
                            Lexiverse 语宙 · AI for SDGs Global Youth Innovation Competition 2026 ·{' '}
                            {new Date(data.generatedAt).toLocaleDateString()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
