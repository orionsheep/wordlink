import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import LanguageToggle from '@/components/welcome/LanguageToggle';

export async function generateMetadata() {
    const t = await getTranslations('model.meta');
    return {
        title: t('title'),
        description: t('description'),
    };
}

const HERO_METRIC_VALUES = ['88.06%', '100%', '0.01%', '9.8'];
const HERO_METRIC_KEYS = ['hit', 'json', 'cefr', 'fkgl'] as const;

const TASK_ROW_KEYS = ['base', 'definition', 'target'] as const;
const CONSTRAINT_KEYS = ['c1', 'c2', 'c3', 'c4'] as const;
const SFT_ROW_KEYS = ['framework', 'data', 'lora', 'hyper', 'precision', 'result'] as const;
const DPO_ROW_KEYS = ['start', 'lora', 'betaLr', 'data', 'guard', 'result'] as const;
const MPS_ROW_KEYS = ['leak', 'denominator', 'fragmentation', 'bf16', 'crash'] as const;

const BENCH_NUMBERS: Array<[string, string, string, string]> = [
    ['63.06%', '0.17%', '82.22%', '13.5'],
    ['88.06%', '0.01%', '100%', '9.82'],
    ['87.78%', '0.01%', '100%', '9.94'],
    ['39.72%', '0.07%', '0%', '—'],
    ['41.67%', '0.12%', '0%', '103.4'],
    ['97.78%', '0.01%', '100%', '10.38'],
    ['98.33%', '0.22%', '100%', '—'],
];
const BENCH_ROW_KEYS = ['base', 'sft', 'dpo', 'q7b', 'q7bLenient', 'deepseek', 'oracle'] as const;

const ARTIFACT_PATHS: Array<[string, string]> = [
    ['outputs/wordlink_edge_sft_v2/', '1d924802e4e298ae5e8086f0bea6fca3'],
    ['outputs/wordlink_lexiconstrain_dpo/', '73d7d16f93985f4386cd7566a7c4c50d'],
    ['outputs/wordlink_edge_sft_v2_merged/', '—'],
    ['outputs/wordlink_edge_sft_v2/training_manifest.json', '—'],
    ['outputs/eval/*_metrics.json', '—'],
    ['data/wordlink_*_train_v2.jsonl + data/bailian/', '—'],
];
const ARTIFACT_ROW_KEYS = ['sftAdapter', 'dpoAdapter', 'mergedBase', 'manifest', 'metrics', 'data'] as const;

const NEXT_STEP_KEYS = ['n1', 'n2', 'n3'] as const;

function SectionShell({
    id,
    eyebrow,
    title,
    sub,
    children,
}: {
    id: string;
    eyebrow: string;
    title: React.ReactNode;
    sub?: string;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="border-t border-white/[0.06] px-6 py-16 md:px-12 lg:px-16">
            <div className="mx-auto max-w-6xl">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/60">{eyebrow}</p>
                <h2 className="mt-3 text-2xl font-medium text-white md:text-3xl">{title}</h2>
                {sub && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/50">{sub}</p>}
                <div className="mt-8">{children}</div>
            </div>
        </section>
    );
}

function DefTable({ rows }: { rows: Array<[string, string]> }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-white/10">
            {rows.map(([k, v], i) => (
                <div
                    key={k}
                    className={`grid gap-1 px-6 py-4 md:grid-cols-[220px_1fr] md:gap-6 ${i % 2 ? 'bg-white/[0.02]' : ''} ${
                        i ? 'border-t border-white/[0.06]' : ''
                    }`}
                >
                    <div className="text-xs font-medium uppercase tracking-wider text-white/40 md:pt-0.5">{k}</div>
                    <div className="text-sm leading-relaxed text-white/75">{v}</div>
                </div>
            ))}
        </div>
    );
}

export default async function ModelReportPage() {
    const t = await getTranslations('model');

    const heroMetrics = HERO_METRIC_KEYS.map((key, i) => ({
        value: HERO_METRIC_VALUES[i],
        label: t(`metrics.${key}.label`),
        note: t(`metrics.${key}.note`),
    }));

    const taskRows = TASK_ROW_KEYS.map(
        (key) => [t(`task.rows.${key}.label`), t(`task.rows.${key}.value`)] as [string, string],
    );
    const constraints = CONSTRAINT_KEYS.map((key) => ({
        t: t(`task.constraints.${key}.t`),
        d: t(`task.constraints.${key}.d`),
    }));
    const sftRows = SFT_ROW_KEYS.map(
        (key) => [t(`sft.rows.${key}.label`), t(`sft.rows.${key}.value`)] as [string, string],
    );
    const dpoRows = DPO_ROW_KEYS.map(
        (key) => [t(`dpo.rows.${key}.label`), t(`dpo.rows.${key}.value`)] as [string, string],
    );
    const mpsRows = MPS_ROW_KEYS.map(
        (key) =>
            [t(`mps.rows.${key}.p`), t(`mps.rows.${key}.s`), t(`mps.rows.${key}.f`)] as [string, string, string],
    );
    const benchRows = BENCH_ROW_KEYS.map((key, i) => ({
        name: t(`bench.rows.${key}.name`),
        note: t(`bench.rows.${key}.note`),
        numbers: BENCH_NUMBERS[i],
    }));
    const artifactRows = ARTIFACT_ROW_KEYS.map((key, i) => ({
        name: t(`artifacts.rows.${key}`),
        path: key === 'manifest' ? `${ARTIFACT_PATHS[i][0]} ${t('artifacts.etc')}` : ARTIFACT_PATHS[i][0],
        md5: ARTIFACT_PATHS[i][1],
    }));
    const nextSteps = NEXT_STEP_KEYS.map((key) => ({
        t: t(`next.${key}.t`),
        d: t(`next.${key}.d`),
    }));

    return (
        <div className="relative min-h-screen bg-[#05080c] font-sans text-[#e5e7eb] antialiased">
            {/* 顶部导航 */}
            <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-black/60 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                    <Link href="/" className="group flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/5 font-serif text-lg italic text-white shadow-sm transition-colors group-hover:border-white/50">
                            L
                        </div>
                        <span className="font-serif-display text-xl italic tracking-wider text-white">Lexiverse</span>
                    </Link>
                    <div className="flex items-center gap-5 text-xs font-medium text-white/60">
                        <LanguageToggle />
                        <Link href="/" className="flex items-center gap-1.5 transition-colors hover:text-white">
                            <ArrowLeft size={13} />
                            <span className="hidden sm:inline">{t('nav.backHome')}</span>
                        </Link>
                        <Link
                            href="/home"
                            className="flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black shadow-md shadow-white/10 transition-all hover:bg-white/90 active:scale-95"
                        >
                            <span>{t('nav.getStarted')}</span>
                            <ArrowUpRight size={13} />
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section className="px-6 pb-16 pt-20 text-center md:px-12">
                <div className="mx-auto max-w-4xl">
                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/60">{t('hero.eyebrow')}</p>
                    <h1 className="mt-6 font-serif-display text-5xl italic tracking-tight text-white md:text-7xl">
                        WordLink-Edge
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-white/60 md:text-base">
                        {t('hero.tagline')}
                        <span className="text-white/85"> {t('hero.taglineHighlight')}</span>
                    </p>
                    <p className="mt-4 text-xs text-white/35">{t('hero.period')}</p>

                    <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
                        {heroMetrics.map((m) => (
                            <div key={m.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left">
                                <div className="font-serif-display text-3xl text-cyan-200/90 tabular-nums">{m.value}</div>
                                <div className="mt-2 text-xs font-medium text-white/80">{m.label}</div>
                                <div className="mt-1 text-[11px] leading-relaxed text-white/35">{m.note}</div>
                            </div>
                        ))}
                    </div>

                    <p className="mx-auto mt-10 max-w-3xl text-left text-sm leading-relaxed text-white/50">
                        {t('hero.evidence')}
                    </p>
                </div>
            </section>

            {/* 01 基座与任务 */}
            <SectionShell
                id="task"
                eyebrow="01 · Task"
                title={
                    <>
                        {t('task.title')}
                        <span className="text-white/40">{t('task.titleAccent')}</span>
                    </>
                }
                sub={t('task.sub')}
            >
                <DefTable rows={taskRows} />
                <div className="mt-6 grid gap-3 md:grid-cols-4">
                    {constraints.map((c) => (
                        <div key={c.t} className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-950/25 to-transparent p-5">
                            <h4 className="text-sm font-medium text-cyan-100/90">{c.t}</h4>
                            <p className="mt-1.5 text-xs leading-relaxed text-white/45">{c.d}</p>
                        </div>
                    ))}
                </div>
            </SectionShell>

            {/* 02 数据工程 */}
            <SectionShell
                id="data"
                eyebrow="02 · Data"
                title={
                    <>
                        {t('data.title')}
                        <span className="text-white/40">{t('data.titleAccent')}</span>
                    </>
                }
                sub={t('data.sub')}
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base text-white">{t('data.gen.title')}</h3>
                            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-0.5 text-[11px] text-cyan-200">{t('data.gen.badge')}</span>
                        </div>
                        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-white/55">
                            <li>{t('data.gen.i1')}</li>
                            <li>{t('data.gen.i2')}</li>
                            <li>{t('data.gen.i3')}</li>
                            <li>
                                {t.rich('data.gen.i4', {
                                    b: (chunks) => <b className="text-white/80">{chunks}</b>,
                                })}
                            </li>
                        </ul>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base text-white">{t('data.neg.title')}</h3>
                            <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-0.5 text-[11px] text-violet-200">{t('data.neg.badge')}</span>
                        </div>
                        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-white/55">
                            <li>
                                {t.rich('data.neg.i1', {
                                    b: (chunks) => <b className="text-white/80">{chunks}</b>,
                                })}
                            </li>
                            <li>{t('data.neg.i2')}</li>
                            <li>{t('data.neg.i3')}</li>
                            <li>{t('data.neg.i4')}</li>
                        </ul>
                    </div>
                </div>
            </SectionShell>

            {/* 03 SFT */}
            <SectionShell
                id="sft"
                eyebrow="03 · SFT"
                title={
                    <>
                        {t('sft.title')}
                        <span className="text-white/40">{t('sft.titleAccent')}</span>
                    </>
                }
                sub={t('sft.sub')}
            >
                <DefTable rows={sftRows} />
            </SectionShell>

            {/* 04 DPO */}
            <SectionShell
                id="dpo"
                eyebrow="04 · DPO"
                title={
                    <>
                        {t('dpo.title')}
                        <span className="text-white/40">{t('dpo.titleAccent')}</span>
                    </>
                }
                sub={t('dpo.sub')}
            >
                <DefTable rows={dpoRows} />

                {/* 事故复盘 */}
                <div className="mt-8 rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-950/25 to-transparent p-7">
                    <p className="text-xs uppercase tracking-[0.25em] text-amber-200/70">{t('dpo.incident.eyebrow')}</p>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{t('dpo.incident.intro')}</p>
                    <ul className="mt-4 space-y-3 text-sm leading-relaxed text-white/55">
                        <li>
                            <b className="text-amber-100/90">{t('dpo.incident.cause1Title')}</b> — {t('dpo.incident.cause1Body')}
                        </li>
                        <li>
                            <b className="text-amber-100/90">{t('dpo.incident.cause2Title')}</b> — {t('dpo.incident.cause2Body')}
                        </li>
                    </ul>
                    <p className="mt-4 text-sm text-white/65">
                        {t.rich('dpo.incident.fix', {
                            b: (chunks) => <b className="text-white/85">{chunks}</b>,
                        })}
                    </p>
                </div>
            </SectionShell>

            {/* 05 MPS 工程 */}
            <SectionShell
                id="mps"
                eyebrow="05 · Engineering"
                title={
                    <>
                        {t('mps.title')}
                        <span className="text-white/40">{t('mps.titleAccent')}</span>
                    </>
                }
                sub={t('mps.sub')}
            >
                <div className="overflow-hidden rounded-2xl border border-white/10">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.04] text-xs text-white/40">
                                <th className="px-6 py-3 font-medium">{t('mps.headers.problem')}</th>
                                <th className="px-4 py-3 font-medium">{t('mps.headers.symptom')}</th>
                                <th className="px-4 py-3 font-medium">{t('mps.headers.fix')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mpsRows.map(([p, s, fix], i) => (
                                <tr key={p} className={`${i % 2 ? 'bg-white/[0.02]' : ''} ${i ? 'border-t border-white/[0.06]' : ''} align-top`}>
                                    <td className="whitespace-nowrap px-6 py-4 font-medium text-white/80">{p}</td>
                                    <td className="px-4 py-4 text-xs leading-relaxed text-white/50">{s}</td>
                                    <td className="px-4 py-4 text-xs leading-relaxed text-white/60">{fix}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionShell>

            {/* 06 实测结果 */}
            <SectionShell
                id="benchmark"
                eyebrow="06 · Benchmark"
                title={
                    <>
                        {t('bench.title')}
                        <span className="text-white/40">{t('bench.titleAccent')}</span>
                    </>
                }
                sub={t('bench.sub')}
            >
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full min-w-[820px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.04] text-xs text-white/40">
                                <th className="px-6 py-3 font-medium">{t('bench.headers.model')}</th>
                                <th className="px-4 py-3 font-medium">{t('bench.headers.hit')}</th>
                                <th className="px-4 py-3 font-medium">{t('bench.headers.oob')}</th>
                                <th className="px-4 py-3 font-medium">{t('bench.headers.json')}</th>
                                <th className="px-4 py-3 font-medium">{t('bench.headers.fkgl')}</th>
                                <th className="px-4 py-3 font-medium">{t('bench.headers.note')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {benchRows.map((row, i) => (
                                <tr
                                    key={row.name}
                                    className={`${i === 1 ? 'bg-emerald-300/[0.06]' : i % 2 ? 'bg-white/[0.02]' : ''} ${
                                        i ? 'border-t border-white/[0.06]' : ''
                                    }`}
                                >
                                    <td className={`px-6 py-3.5 ${i === 1 ? 'font-medium text-emerald-200' : 'text-white/75'}`}>{row.name}</td>
                                    <td className={`px-4 py-3.5 tabular-nums ${i === 1 ? 'text-emerald-200' : 'text-white/75'}`}>{row.numbers[0]}</td>
                                    <td className={`px-4 py-3.5 tabular-nums ${i === 1 ? 'text-emerald-200' : 'text-white/75'}`}>{row.numbers[1]}</td>
                                    <td className={`px-4 py-3.5 tabular-nums ${i === 1 ? 'text-emerald-200' : 'text-white/75'}`}>{row.numbers[2]}</td>
                                    <td className="px-4 py-3.5 tabular-nums text-white/55">{row.numbers[3]}</td>
                                    <td className="px-4 py-3.5 text-xs text-white/40">{row.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-white/35">{t('bench.footnote')}</p>
            </SectionShell>

            {/* 07 产物 */}
            <SectionShell
                id="artifacts"
                eyebrow="07 · Artifacts"
                title={
                    <>
                        {t('artifacts.title')}
                        <span className="text-white/40">{t('artifacts.titleAccent')}</span>
                    </>
                }
            >
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.04] text-xs text-white/40">
                                <th className="px-6 py-3 font-medium">{t('artifacts.headers.artifact')}</th>
                                <th className="px-4 py-3 font-medium">{t('artifacts.headers.location')}</th>
                                <th className="px-4 py-3 font-medium">{t('artifacts.headers.md5')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {artifactRows.map((row, i) => (
                                <tr key={row.name} className={`${i % 2 ? 'bg-white/[0.02]' : ''} ${i ? 'border-t border-white/[0.06]' : ''}`}>
                                    <td className="px-6 py-3.5 text-white/75">{row.name}</td>
                                    <td className="px-4 py-3.5 font-mono text-xs text-white/50">{row.path}</td>
                                    <td className="px-4 py-3.5 font-mono text-xs text-white/40">{row.md5}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionShell>

            {/* 08 后续 */}
            <SectionShell
                id="next"
                eyebrow="08 · Roadmap"
                title={
                    <>
                        {t('next.title')}
                        <span className="text-white/40">{t('next.titleAccent')}</span>
                    </>
                }
            >
                <div className="grid gap-4 md:grid-cols-3">
                    {nextSteps.map((s) => (
                        <div key={s.t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                            <h4 className="text-sm font-medium text-white">{s.t}</h4>
                            <p className="mt-2 text-xs leading-relaxed text-white/45">{s.d}</p>
                        </div>
                    ))}
                </div>
            </SectionShell>

            {/* 底部 */}
            <footer className="border-t border-white/[0.08] bg-black/60 px-6 py-12 backdrop-blur-2xl">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 text-xs text-white/40 md:flex-row">
                    <p>{t('footer.sources')}</p>
                    <Link href="/" className="flex items-center gap-1.5 transition-colors hover:text-white">
                        <ArrowLeft size={13} />
                        {t('footer.backHome')}
                    </Link>
                </div>
            </footer>
        </div>
    );
}
