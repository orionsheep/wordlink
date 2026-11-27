'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2, CircleAlert, Loader2, Lock } from 'lucide-react';

type Status = 'checking' | 'paid' | 'pending' | 'unauthorized' | 'not_found' | 'error' | 'no_order';

const MAX_ATTEMPTS = 10; // 1.5s 间隔 ≈ 15s
const POLL_INTERVAL_MS = 1500;

export default function PayReturnClient() {
    const t = useTranslations('pay.return');
    const searchParams = useSearchParams();
    const outTradeNo = searchParams.get('out_trade_no') || '';

    const [status, setStatus] = useState<Status>('checking');
    const [runId, setRunId] = useState(0);
    const attemptsRef = useRef(0);
    const effectiveStatus: Status = outTradeNo ? status : 'no_order';

    useEffect(() => {
        if (!outTradeNo) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        attemptsRef.current = 0;

        const poll = async () => {
            attemptsRef.current += 1;
            try {
                const res = await fetch(`/api/pay/orders/${encodeURIComponent(outTradeNo)}`, {
                    credentials: 'include',
                    cache: 'no-store',
                });
                const data = await res.json().catch(() => null);
                if (cancelled) return;

                if (res.status === 401) {
                    setStatus('unauthorized');
                    return;
                }
                if (res.status === 404) {
                    setStatus('not_found');
                    return;
                }
                if (!res.ok) {
                    if (res.status >= 500 || res.status === 429) {
                        if (attemptsRef.current >= MAX_ATTEMPTS) {
                            setStatus('error');
                            return;
                        }
                        timer = setTimeout(poll, POLL_INTERVAL_MS);
                        return;
                    }
                    setStatus('error');
                    return;
                }

                if (data?.status === 'paid') {
                    setStatus('paid');
                    // 让 auth:me 缓存失效，布局里的 Pro 徽标立即刷新
                    window.dispatchEvent(new CustomEvent('auth-state-changed'));
                    return;
                }
                if (data?.status === 'closed') {
                    setStatus('error');
                    return;
                }
                if (attemptsRef.current >= MAX_ATTEMPTS) {
                    setStatus('pending');
                    return;
                }
                timer = setTimeout(poll, POLL_INTERVAL_MS);
            } catch {
                if (cancelled) return;
                if (attemptsRef.current >= MAX_ATTEMPTS) {
                    setStatus('error');
                } else {
                    timer = setTimeout(poll, POLL_INTERVAL_MS);
                }
            }
        };

        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [outTradeNo, runId]);

    const handleRecheck = () => {
        setStatus('checking');
        setRunId((v) => v + 1);
    };

    return (
        <div className="relative min-h-screen bg-black text-neutral-200 font-sans antialiased flex items-center justify-center px-6">
            <div className="pointer-events-none fixed inset-0 opacity-50">
                <div className="absolute left-1/3 top-1/4 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px]" />
            </div>

            <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-md">
                {effectiveStatus === 'checking' && (
                    <>
                        <Loader2 size={36} className="mx-auto animate-spin text-white/60" />
                        <h1 className="mt-6 text-xl font-medium text-white">{t('checking')}</h1>
                        <p className="mt-2 text-xs text-white/45">{t('checkingDesc')}</p>
                    </>
                )}

                {effectiveStatus === 'paid' && (
                    <>
                        <CheckCircle2 size={40} className="mx-auto text-emerald-300" />
                        <h1 className="mt-6 text-xl font-medium text-white">{t('success')}</h1>
                        <p className="mt-2 text-xs text-white/55">{t('successDesc')}</p>
                        <Link
                            href="/home"
                            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-xs font-semibold text-black transition-all hover:bg-white/90 active:scale-95"
                        >
                            <span>{t('startUsing')}</span>
                            <ArrowRight size={13} />
                        </Link>
                    </>
                )}

                {effectiveStatus === 'pending' && (
                    <>
                        <Loader2 size={36} className="mx-auto text-amber-200/70" />
                        <h1 className="mt-6 text-xl font-medium text-white">{t('pending')}</h1>
                        <p className="mt-2 text-xs text-white/45">{t('pendingDesc')}</p>
                        <div className="mt-8 flex items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={handleRecheck}
                                className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-white/90"
                            >
                                {t('recheck')}
                            </button>
                            <Link href="/home" className="text-xs text-white/50 hover:text-white">
                                {t('goHome')}
                            </Link>
                        </div>
                    </>
                )}

                {effectiveStatus === 'unauthorized' && (
                    <>
                        <Lock size={36} className="mx-auto text-amber-300/80" />
                        <h1 className="mt-6 text-xl font-medium text-white">{t('unauthorized')}</h1>
                        <p className="mt-2 text-xs text-white/50">{t('unauthorizedDesc')}</p>
                        <div className="mt-8 flex items-center justify-center gap-3">
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-white/90"
                            >
                                <span>{t('loginToCheck')}</span>
                                <ArrowRight size={13} />
                            </Link>
                            <Link href="/home" className="text-xs text-white/50 hover:text-white">
                                {t('goHome')}
                            </Link>
                        </div>
                    </>
                )}

                {effectiveStatus === 'not_found' && (
                    <>
                        <CircleAlert size={36} className="mx-auto text-rose-300/80" />
                        <h1 className="mt-6 text-xl font-medium text-white">{t('notFound')}</h1>
                        <p className="mt-2 text-xs text-white/50">{t('notFoundDesc')}</p>
                        <Link href="/home" className="mt-8 inline-block text-xs text-white/50 hover:text-white">
                            {t('goHome')}
                        </Link>
                    </>
                )}

                {(effectiveStatus === 'error' || effectiveStatus === 'no_order') && (
                    <>
                        <CircleAlert size={36} className="mx-auto text-rose-300/80" />
                        <h1 className="mt-6 text-xl font-medium text-white">
                            {effectiveStatus === 'no_order' ? t('noOrder') : t('error')}
                        </h1>
                        {effectiveStatus === 'error' && (
                            <p className="mt-2 text-xs text-white/50">{t('errorDesc')}</p>
                        )}
                        <div className="mt-8 flex items-center justify-center gap-3">
                            {effectiveStatus === 'error' && outTradeNo && (
                                <button
                                    type="button"
                                    onClick={handleRecheck}
                                    className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-white/90"
                                >
                                    {t('recheck')}
                                </button>
                            )}
                            <Link href="/home" className="text-xs text-white/50 hover:text-white">
                                {t('goHome')}
                            </Link>
                        </div>
                    </>
                )}

                {outTradeNo && (
                    <p className="mt-8 break-all text-[10px] text-white/25">
                        {t('orderNo', { no: outTradeNo })}
                    </p>
                )}
            </div>
        </div>
    );
}
