'use client';

import Link from 'next/link';
import Hero from './Hero';
import AboutSection from './AboutSection';
import FeaturedVideoSection from './FeaturedVideoSection';
import PhilosophySection from './PhilosophySection';
import ServicesSection from './ServicesSection';

/**
 * WordLink 官方 Landing Page(挂在 `/`,`/welcome` 为兼容旧链接的重定向)。
 * 由 Hero + About + Featured + Philosophy + Services + Footer 组成。
 */
export default function LandingPage() {
    return (
        <div className="bg-black">
            <Hero />
            <AboutSection />
            <FeaturedVideoSection />
            <PhilosophySection />
            <ServicesSection />

            {/* ================= Footer ================= */}
            <footer className="border-t border-white/[0.06] bg-black px-6 py-10 md:px-12 lg:px-16">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
                    <span className="font-serif-display text-lg text-white">WordLink</span>
                    <span className="text-xs text-white/40">英语单词裂变与认知星图系统 · © 2026</span>
                    <div className="flex gap-5 text-xs text-white/40">
                        <Link href="/login" className="transition-colors hover:text-white">
                            登录
                        </Link>
                        <Link href="/reset-password" className="transition-colors hover:text-white">
                            找回密码
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
