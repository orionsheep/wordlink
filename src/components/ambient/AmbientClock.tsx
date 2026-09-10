'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SeasonId } from './SoundScapeEngine';

const SEASON_KEY: Record<SeasonId, string> = {
    spring: 'seasonSpring',
    summer: 'seasonSummer',
    autumn: 'seasonAutumn',
    winter: 'seasonWinter',
};

/** 屏保要素：左上角细体时钟 + 日期 + 当前季节 */
export default function AmbientClock({ season }: { season: SeasonId }) {
    const t = useTranslations('ambient');
    const locale = useLocale();
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        // 用异步回调设置初始时间，避免在 effect 体内同步 setState
        const kickoff = window.setTimeout(() => setNow(new Date()), 0);
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => {
            window.clearTimeout(kickoff);
            window.clearInterval(timer);
        };
    }, []);

    if (!now) return null;

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const dateLine = now.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });

    return (
        <div className="ambient-fade absolute left-6 top-6 z-[3] sm:left-10 sm:top-9">
            <div
                className="font-light tabular-nums text-white/85 text-4xl sm:text-5xl"
                style={{ fontFamily: 'system-ui, sans-serif' }}
            >
                {hh}:{mm}
            </div>
            <div className="mt-1.5 text-white/40 text-[11px] sm:text-xs" style={{ fontFamily: 'system-ui, sans-serif' }}>
                {dateLine} · {t(SEASON_KEY[season])}
            </div>
        </div>
    );
}
