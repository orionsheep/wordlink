'use client';

/**
 * S6 · 全功能巡礼
 * 11 张真机截图(由 scripts/capture-showcase.js 自动采集)组成的滚动画廊。
 * title/desc 文案经 landing.gallery.features 分片接入 i18n。
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const FEATURES: Array<{ img: string; name: string; id: string; href: string }> = [
    { img: '/images/showcase/home.jpg', name: 'Workspace', id: 'workspace', href: '/home' },
    { img: '/images/showcase/study.jpg', name: 'Study', id: 'study', href: '/study' },
    { img: '/images/showcase/navigator.jpg', name: 'Navigator', id: 'navigator', href: '/navigator' },
    { img: '/images/showcase/quiz.jpg', name: 'Quiz', id: 'quiz', href: '/quiz' },
    { img: '/images/showcase/immersive.jpg', name: 'Immersive', id: 'immersive', href: '/immersive' },
    { img: '/images/showcase/ambient.jpg', name: 'Ambient', id: 'ambient', href: '/ambient' },
    { img: '/images/showcase/read.jpg', name: 'Read', id: 'read', href: '/read' },
    { img: '/images/showcase/passport.jpg', name: 'Passport', id: 'passport', href: '/passport' },
    { img: '/images/showcase/dashboard.jpg', name: 'Report', id: 'report', href: '/dashboard' },
    { img: '/images/showcase/my-libraries.jpg', name: 'Libraries', id: 'libraries', href: '/my-libraries' },
    { img: '/images/showcase/settings.jpg', name: 'Settings', id: 'settings', href: '/settings' },
];

export default function FeatureGallery() {
    const t = useTranslations('landing.gallery');

    return (
        <section id="features-gallery" className="relative border-t border-white/[0.06] bg-black/85 backdrop-blur-md px-6 py-24 md:px-12 lg:px-16">
            <div className="mx-auto max-w-6xl">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/60">Product Tour</p>
                <h2 className="mt-4 text-3xl font-medium text-white md:text-4xl">
                    {t('titleA')}
                    <span className="text-white/40">{t('titleB')}</span>
                </h2>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/50">
                  {t('intro')}
                </p>

                <div className="mt-12 space-y-16">
                    {FEATURES.map((f, i) => {
                        const title = t(`features.${f.id}.title`);
                        return (
                        <Link
                            key={f.name}
                            href={f.href}
                            className="group grid items-center gap-8 md:grid-cols-[1.5fr_1fr] md:gap-12"
                        >
                            <div className={`overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50 transition duration-500 group-hover:border-cyan-200/30 ${i % 2 ? 'md:order-2' : ''}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={f.img}
                                    alt={t('alt', { title })}
                                    loading="lazy"
                                    className="w-full transition duration-700 group-hover:scale-[1.02]"
                                />
                            </div>
                            <div className={i % 2 ? 'md:order-1 md:text-right' : ''}>
                                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/60">{f.name}</p>
                                <h3 className="mt-2 text-2xl font-medium text-white">{title}</h3>
                                <p className="mt-3 text-sm leading-relaxed text-white/50">{t(`features.${f.id}.desc`)}</p>
                                <p className="mt-4 text-xs text-cyan-200/70 opacity-0 transition duration-300 group-hover:opacity-100">
                                    {t('cta')}
                                </p>
                            </div>
                        </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
