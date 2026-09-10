'use client';

/**
 * S5 · 模型训练与实测数据
 * 展示级模型板块:大号前后对比 + 命中率条形图 + DPO margins + 五阶段流水线 + 实测对照表。
 * 所有数字来自 outputs/eval 实测产物(90 题基准 · 贪心解码 · temperature=0)。
 * 文案经 landing.training 分片接入 i18n,数字保持原样。
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Cpu, Database, TrendingUp } from 'lucide-react';

const PIPELINE_IDS = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'] as const;
const PIPELINE_NUMS = ['01', '02', '03', '04', '05'] as const;

const BENCH: Array<{ id: string; hit: string; json: string; fkgl: string }> = [
    { id: 'qwenBase', hit: '63.06%', json: '82.22%', fkgl: '13.5' },
    { id: 'sft', hit: '88.06%', json: '100%', fkgl: '9.8' },
    { id: 'dpo', hit: '87.78%', json: '100%', fkgl: '9.9' },
    { id: 'deepseek', hit: '97.78%', json: '100%', fkgl: '—' },
    { id: 'teacher', hit: '98.33%', json: '100%', fkgl: '—' },
];

/** 命中率条形图(值 = 生词注入命中率实测;label/note 走 i18n) */
const HIT_BARS: Array<{ id: string; value: number; tone: 'base' | 'ours' | 'ref' }> = [
    { id: 'teacherOracle', value: 98.33, tone: 'ref' },
    { id: 'deepseekZero', value: 97.78, tone: 'ref' },
    { id: 'edgeSft', value: 88.06, tone: 'ours' },
    { id: 'edgeDpo', value: 87.78, tone: 'ours' },
    { id: 'qwenBase', value: 63.06, tone: 'base' },
];

const BAR_STYLE: Record<string, string> = {
    ours: 'bg-gradient-to-r from-emerald-400/80 to-cyan-300/80',
    base: 'bg-white/25',
    ref: 'bg-white/10',
};

function useInView<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ob = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    setInView(true);
                    ob.disconnect();
                }
            },
            { threshold: 0.25 },
        );
        ob.observe(el);
        return () => ob.disconnect();
    }, []);
    return { ref, inView };
}

function CountUp({ to, decimals = 2, start, duration = 1400 }: { to: number; decimals?: number; start: boolean; duration?: number }) {
    const [v, setV] = useState(0);
    useEffect(() => {
        if (!start) return;
        let raf = 0;
        const t0 = performance.now();
        const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setV(to * eased);
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [start, to, duration]);
    return <span className="tabular-nums">{v.toFixed(decimals)}</span>;
}

export default function TrainingSection() {
    const t = useTranslations('landing.training');
    const hero = useInView<HTMLDivElement>();
    const bars = useInView<HTMLDivElement>();

    return (
        <section id="training" className="relative border-t border-white/[0.06] bg-[#05080c]/90 backdrop-blur-md px-6 py-24 md:px-12 lg:px-16">
            <div className="mx-auto max-w-6xl">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/60">Model</p>
                <h2 className="mt-4 text-3xl font-medium text-white md:text-4xl">
                    {t('titleA')}
                    <span className="text-white/40">{t('titleB')}</span>
                </h2>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/50">
                    {t('intro')}
                </p>

                {/* ===== 展示位:前后对比 + 条形图 ===== */}
                <div className="mt-12 grid gap-4 lg:grid-cols-12">
                    {/* 左:大号前后对比 */}
                    <div
                        ref={hero.ref}
                        className="rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-emerald-950/25 via-transparent to-cyan-950/20 p-8 lg:col-span-5"
                    >
                        <p className="text-xs uppercase tracking-[0.25em] text-white/40">{t('heroLabel')}</p>
                        <div className="mt-6 flex items-end gap-4">
                            <div>
                                <div className="text-xs text-white/35">{t('heroBefore')}</div>
                                <div className="font-serif-display text-4xl text-white/40">
                                    <CountUp to={63.06} start={hero.inView} />%
                                </div>
                            </div>
                            <div className="pb-2 text-2xl text-emerald-300/70">→</div>
                            <div>
                                <div className="text-xs text-emerald-200/70">{t('heroAfter')}</div>
                                <div className="font-serif-display text-6xl text-emerald-200">
                                    <CountUp to={88.06} start={hero.inView} />%
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3.5 py-1 text-xs font-medium text-emerald-200">
                            {t('heroBadge')}
                        </div>
                        <div className="mt-7 grid grid-cols-3 gap-3 border-t border-white/[0.08] pt-6 text-center">
                            <div>
                                <div className="font-serif-display text-xl text-white tabular-nums">
                                    <CountUp to={100} decimals={0} start={hero.inView} />%
                                </div>
                                <div className="mt-1 text-[11px] leading-snug text-white/40">{t('statJsonA')}<br />{t('statJsonB')}</div>
                            </div>
                            <div>
                                <div className="font-serif-display text-xl text-white tabular-nums">0.01%</div>
                                <div className="mt-1 text-[11px] leading-snug text-white/40">{t('statCefrA')}<br />{t('statCefrB')}</div>
                            </div>
                            <div>
                                <div className="font-serif-display text-xl text-white tabular-nums">9.8</div>
                                <div className="mt-1 text-[11px] leading-snug text-white/40">{t('statFkglA')}<br />{t('statFkglB')}</div>
                            </div>
                        </div>
                    </div>

                    {/* 右:命中率条形对比图 */}
                    <div ref={bars.ref} className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 lg:col-span-7">
                        <div className="flex items-baseline justify-between">
                            <p className="text-xs uppercase tracking-[0.25em] text-white/40">{t('barsLabel')}</p>
                            <p className="text-[11px] text-white/30">{t('barsMeta')}</p>
                        </div>
                        <div className="mt-6 space-y-4">
                            {HIT_BARS.map((b) => (
                                <div key={b.id}>
                                    <div className="flex items-baseline justify-between text-xs">
                                        <span className={b.tone === 'ours' ? 'font-medium text-emerald-200' : 'text-white/55'}>{t(`bars.${b.id}.label`)}</span>
                                        <span className={`tabular-nums ${b.tone === 'ours' ? 'font-medium text-emerald-200' : 'text-white/40'}`}>
                                            {b.value.toFixed(2)}%
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                                        <div
                                            className={`h-full rounded-full ${BAR_STYLE[b.tone]} transition-[width] duration-[1200ms] ease-out`}
                                            style={{ width: bars.inView ? `${b.value}%` : '0%' }}
                                        />
                                    </div>
                                    <div className="mt-1 text-[10px] text-white/30">{t(`bars.${b.id}.note`)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ===== 三张卖点卡 ===== */}
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex items-center gap-2 text-cyan-200/80">
                            <TrendingUp size={15} />
                            <h4 className="text-sm font-medium text-white">{t('card1Title')}</h4>
                        </div>
                        <div className="mt-4 flex items-end justify-between">
                            <div>
                                <div className="text-[11px] text-white/35">{t('card1Start')}</div>
                                <div className="font-serif-display text-2xl text-white/50 tabular-nums">0.105</div>
                            </div>
                            <svg viewBox="0 0 120 36" className="h-9 w-28 text-emerald-300/70" fill="none">
                                <path d="M2 32 L118 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <circle cx="2" cy="32" r="3" fill="currentColor" opacity="0.5" />
                                <circle cx="118" cy="6" r="3" fill="currentColor" />
                            </svg>
                            <div className="text-right">
                                <div className="text-[11px] text-white/35">{t('card1End')}</div>
                                <div className="font-serif-display text-2xl text-emerald-200 tabular-nums">11.28</div>
                            </div>
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-white/40">
                            {t('card1Desc')}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex items-center gap-2 text-cyan-200/80">
                            <Cpu size={15} />
                            <h4 className="text-sm font-medium text-white">{t('card2Title')}</h4>
                        </div>
                        <div className="mt-4 font-serif-display text-3xl text-white">~950MB</div>
                        <p className="mt-2 text-xs leading-relaxed text-white/40">
                            {t('card2Desc')}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex items-center gap-2 text-cyan-200/80">
                            <Database size={15} />
                            <h4 className="text-sm font-medium text-white">{t('card3Title')}</h4>
                        </div>
                        <div className="mt-4 font-serif-display text-3xl text-white tabular-nums">{t('card3Value')}</div>
                        <p className="mt-2 text-xs leading-relaxed text-white/40">
                            {t('card3Desc')}
                        </p>
                    </div>
                </div>

                {/* ===== 流水线 ===== */}
                <p className="mt-16 text-xs uppercase tracking-[0.3em] text-cyan-200/60">Pipeline</p>
                <h3 className="mt-3 text-2xl font-medium text-white md:text-3xl">
                    {t('pipelineTitle')}
                </h3>
                <div className="mt-8 grid gap-3 md:grid-cols-5">
                    {PIPELINE_IDS.map((id, i) => (
                        <div key={id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                            <div className="font-serif-display text-2xl text-cyan-200/80">{PIPELINE_NUMS[i]}</div>
                            <h4 className="mt-2 text-sm font-medium text-white">{t(`pipeline.${id}.title`)}</h4>
                            <p className="mt-2 text-xs leading-relaxed text-white/45">{t(`pipeline.${id}.desc`)}</p>
                        </div>
                    ))}
                </div>

                {/* ===== 对照表 ===== */}
                <div className="mt-14 overflow-hidden rounded-2xl border border-white/10">
                    <div className="border-b border-white/10 bg-white/[0.04] px-6 py-4">
                        <h3 className="text-sm font-medium text-white">
                            {t('tableTitle')} <span className="text-white/35">{t('tableSubtitle')}</span>
                        </h3>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="text-xs text-white/40">
                                <th className="px-6 py-3 font-medium">{t('thModel')}</th>
                                <th className="px-4 py-3 font-medium">{t('thHit')}</th>
                                <th className="px-4 py-3 font-medium">{t('thJson')}</th>
                                <th className="px-4 py-3 font-medium">{t('thFkgl')}</th>
                                <th className="px-4 py-3 font-medium">{t('thNote')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {BENCH.map((row, i) => (
                                <tr key={row.id} className={i === 1 ? 'bg-emerald-300/[0.06]' : i % 2 ? 'bg-white/[0.02]' : ''}>
                                    <td className={`px-6 py-3 ${i === 1 ? 'font-medium text-emerald-200' : 'text-white/75'}`}>{t(`bench.${row.id}.model`)}</td>
                                    <td className={`px-4 py-3 tabular-nums ${i === 1 ? 'text-emerald-200' : 'text-white/75'}`}>{row.hit}</td>
                                    <td className={`px-4 py-3 tabular-nums ${i === 1 ? 'text-emerald-200' : 'text-white/75'}`}>{row.json}</td>
                                    <td className="px-4 py-3 tabular-nums text-white/55">{row.fkgl}</td>
                                    <td className="px-4 py-3 text-xs text-white/40">{t(`bench.${row.id}.note`)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-xs text-white/35">
                  {t('footnote')}
                </p>
                <div className="mt-8 flex justify-center">
                    <Link
                        href="/model"
                        className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-6 py-2.5 text-xs font-medium text-cyan-100/90 backdrop-blur-md transition-all hover:border-cyan-300/50 hover:bg-cyan-300/[0.12] active:scale-95"
                    >
                        <span>{t('reportLink')}</span>
                        <ArrowUpRight size={13} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
