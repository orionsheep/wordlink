'use client';

/**
 * S4 · 核心技术架构
 * 神经符号混合双引擎 + 端云双模型矩阵,纯 CSS 图解(无图片依赖)。
 */
import { useTranslations } from 'next-intl';

export default function ArchitectureSection() {
    const t = useTranslations('landing.architecture');
    const bold = (chunks: React.ReactNode) => <b className="text-white/80">{chunks}</b>;

    return (
        <section id="architecture" className="relative border-t border-white/[0.06] bg-black/85 backdrop-blur-md px-6 py-24 md:px-12 lg:px-16">
            <div className="mx-auto max-w-6xl">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/60">Architecture</p>
                <h2 className="mt-4 text-3xl font-medium text-white md:text-4xl">
                    {t('titleA')}
                    <span className="text-white/40">{t('titleB')}</span>
                </h2>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/50">
                    {t('intro')}
                </p>

                {/* 双引擎 */}
                <div className="mt-12 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-950/30 to-transparent p-7">
                        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/70">{t('symbolicTag')}</p>
                        <h3 className="mt-3 text-xl text-white">{t('symbolicTitle')}</h3>
                        <ul className="mt-4 space-y-2 text-sm text-white/55">
                            <li>{t('symbolic1')}</li>
                            <li>{t('symbolic2')}</li>
                            <li>{t('symbolic3')}</li>
                            <li>{t('symbolic4')}</li>
                        </ul>
                    </div>
                    <div className="rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-950/30 to-transparent p-7">
                        <p className="text-xs uppercase tracking-[0.25em] text-violet-200/70">{t('neuralTag')}</p>
                        <h3 className="mt-3 text-xl text-white">{t('neuralTitle')}</h3>
                        <ul className="mt-4 space-y-2 text-sm text-white/55">
                            <li>{t('neural1')}</li>
                            <li>{t('neural2')}</li>
                            <li>{t('neural3')}</li>
                            <li>{t('neural4')}</li>
                        </ul>
                    </div>
                </div>

                {/* 专用模型 */}
                <div className="mt-10">
                    <p className="text-center text-xs uppercase tracking-[0.25em] text-white/35">{t('dedicatedLabel')}</p>
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-7">
                        <div className="flex items-center justify-between">
                            <h4 className="text-lg text-white">WordLink-Edge</h4>
                            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-0.5 text-[11px] text-emerald-200">{t('edgeBadge')}</span>
                        </div>
                        <p className="mt-2 text-xs text-white/40">{t('edgeSub')}</p>
                        <div className="mt-4 grid gap-x-8 gap-y-2 text-sm text-white/55 md:grid-cols-3">
                            <li className="list-none">{t.rich('edgePoint1', { b: bold })}</li>
                            <li className="list-none">{t.rich('edgePoint2', { b: bold })}</li>
                            <li className="list-none">{t('edgePoint3')}</li>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
