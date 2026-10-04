'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, BarChart3, BookOpenText, Check, ChevronRight, Compass, Headphones, LibraryBig, LogOut, Moon, MoonStar, Play, Plus, Search, Settings, Sparkles, Sun, Target, Waypoints } from 'lucide-react';
import type { ReaderArticle } from '@/lib/reader-engine/types';
import { cachedFetch, cacheDelete } from '@/lib/client-cache';

interface DueWord { word: string; stage: string; memoryStrength: number; }
interface HomeSummary {
  streak: number;
  totalWords: number;
  dueWords: DueWord[];
  stageCounts: Record<string, number>;
  todayQuiz: { count: number; correctRate: number | null };
  recent: Array<{ word: string; isCorrect: boolean; timestamp: string }>;
}

function timeGreetingKey() {
  const hour = new Date().getHours();
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function GlassCard({ href, className = '', children }: { href?: string; className?: string; children: React.ReactNode }) {
  const card = <div className={`home-card group relative h-full overflow-hidden rounded-[24px] border border-white/10 bg-[#10151a]/80 p-5 text-white shadow-2xl shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#151b20]/90 ${className}`}>{children}</div>;
  return href ? <Link href={href} className="block h-full">{card}</Link> : card;
}

function UserMenu() {
  const t = useTranslations('homePage.account');
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void cachedFetch<{ email?: string }>('auth:me', () =>
      fetch('/api/auth/me', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.user ?? null)
        .catch(() => null)
    ).then((user) => setEmail(user?.email ?? null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const handleLogout = async () => {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      cacheDelete('auth:me');
      window.location.href = '/login';
    }
  };

  const initial = (email ?? '?').charAt(0).toUpperCase();
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={t('menu')} title={email ?? t('fallback')} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/25 text-xs font-semibold text-white/85 transition hover:bg-white/10 hover:text-white">
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-white/10 bg-[#10151a]/95 p-2 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="truncate px-2.5 py-2 text-[11px] text-white/55">{email ?? t('unavailable')}</div>
          <button type="button" onClick={handleLogout} disabled={pending} className="mt-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50">
            <LogOut size={14} />
            {pending ? t('loggingOut') : t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const t = useTranslations('homePage');
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [articles, setArticles] = useState<ReaderArticle[]>([]);
  const [articleIndex, setArticleIndex] = useState(0);
  // null = 主题未从 localStorage 解析；未解析前不渲染任何背景图，避免下错主题图
  const [dayMode, setDayMode] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch('/api/home/summary', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then(setSummary).catch(() => setSummary(null));
    void fetch('/api/articles').then((r) => (r.ok ? r.json() : [])).then((data) => setArticles(Array.isArray(data) ? data : [])).catch(() => setArticles([]));
  }, []);

  useEffect(() => {
    try {
      setDayMode(localStorage.getItem('lexiverse-home-theme') === 'day');
    } catch {
      /* keep the night default */
    }
  }, []);

  const toggleDayMode = () => {
    setDayMode((current) => {
      const next = !current;
      try {
        localStorage.setItem('lexiverse-home-theme', next ? 'day' : 'night');
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const article = useMemo(() => articles[articleIndex], [articles, articleIndex]);
  const dueCount = summary?.dueWords.length ?? 0;
  const quizRate = summary?.todayQuiz.correctRate ?? 0;
  const themeLabel = dayMode ? t('nav.day') : t('nav.night');
  const themeSwitchLabel = dayMode ? t('nav.switchToNight') : t('nav.switchToDay');

  return (
    <div className={`relative min-h-[100dvh] overflow-hidden text-white transition-colors duration-500 ${dayMode ? 'bg-[#dfe9ed]' : 'bg-[#071016]'}`} data-home-theme={dayMode ? 'day' : 'night'}>
      {dayMode !== null && (
        <div
          key={dayMode ? 'day' : 'night'}
          className="home-bg-enter pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: dayMode ? "url('/images/lexiverse-home-day.jpg')" : "url('/images/lexiverse-home-night.jpg')" }}
        />
      )}
      <div className={`pointer-events-none absolute inset-0 transition duration-700 ${dayMode ? 'bg-[linear-gradient(180deg,rgba(226,239,243,.2),rgba(226,239,243,.62)_72%,#dfe9ed)]' : 'bg-[linear-gradient(180deg,rgba(4,9,14,.3),rgba(4,9,14,.68)_72%,#05080b)]'}`} />

      <header className="home-header relative z-10 flex h-16 items-center justify-between px-4 sm:px-7 lg:px-10">
        <div className="flex items-center gap-3"><Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-lg italic text-white backdrop-blur-md transition hover:bg-white/10" style={{ fontFamily: "'Instrument Serif', serif" }}>L</Link><div className="hidden text-xs tracking-[0.2em] text-white/50 sm:block">LEXIVERSE · 语宙</div></div>
        <button type="button" onClick={toggleDayMode} aria-pressed={dayMode === true} aria-label={themeSwitchLabel} title={themeSwitchLabel} className={`absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur-md transition ${dayMode ? 'border-amber-200/70 bg-white/60 text-slate-700' : 'border-white/15 bg-black/35 text-white/75'}`}>
          <span className={`relative flex h-5 w-9 items-center rounded-full p-0.5 transition ${dayMode ? 'bg-amber-200/80' : 'bg-slate-700/80'}`}><span className={`flex h-4 w-4 items-center justify-center rounded-full shadow-sm transition-transform ${dayMode ? 'translate-x-4 bg-white text-amber-500' : 'translate-x-0 bg-slate-100 text-slate-700'}`}>{dayMode ? <Sun size={11} /> : <Moon size={11} />}</span></span>
          <span>{themeLabel}</span>
        </button>
        <nav className="flex items-center gap-1.5 text-[11px] text-white/65"><Link href="/dashboard" className="hidden rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white sm:block">{t('nav.reports')}</Link><Link href="/settings" className="hidden rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white sm:block">{t('nav.settings')}</Link><UserMenu /><Link href="/navigator" aria-label={t('nav.search')} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/25 transition hover:bg-white/10 hover:text-white"><Search size={15} /></Link></nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1240px] px-4 pb-10 pt-8 sm:px-7 sm:pt-12 lg:px-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs uppercase tracking-[0.28em] text-white/45">Mission control</p><h1 className="text-3xl font-medium tracking-tight text-white sm:text-4xl" style={{ fontFamily: "'Instrument Serif', serif" }}>{t(`greeting.${timeGreetingKey()}`)}</h1><p className="mt-2 text-sm text-white/55">{t('tagline')}</p></div><div className="hidden items-center gap-2 text-[11px] text-white/45 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{t('systemOnline')}</div></div>

        <section className="grid auto-rows-[minmax(150px,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GlassCard href="/study" className="min-h-[190px] bg-[#132338]/75"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"><Plus size={21} /></span><ArrowUpRight size={17} className="text-white/35 transition group-hover:text-white" /></div><div><p className="text-lg font-medium">{t('cards.startStudy.title')}</p><p className="mt-1 text-xs text-white/45">{t('cards.startStudy.desc')}</p></div></div></GlassCard>
          <GlassCard href={article ? `/read/${article.id}` : '/read'} className="min-h-[190px] lg:col-span-2"><div className="flex h-full flex-col justify-between"><div className="flex items-start justify-between"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-200/75"><BookOpenText size={14} />{t('continueReading')}</div><Play size={17} className="text-white/35 transition group-hover:text-cyan-200" /></div><div><p className="line-clamp-2 text-2xl leading-tight" style={{ fontFamily: "'Instrument Serif', serif" }}>{article?.title ?? t('cards.pickArticle')}</p><p className="mt-2 text-xs text-white/45">{article?.recommendationReason ?? t('cards.rmePick')}</p></div></div></GlassCard>
          <GlassCard href="/quiz?from=%2Fhome" className="min-h-[190px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-300/15 text-amber-200"><Target size={20} /></span><span className="text-xs text-amber-200/80">{t('cards.review.due', { count: dueCount })}</span></div><div><p className="text-lg font-medium">{t('cards.review.title')}</p><p className="mt-1 text-xs text-white/45">{t('cards.review.stats', { count: summary?.todayQuiz.count ?? 0, rate: quizRate })}</p></div></div></GlassCard>
          <GlassCard href="/navigator" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><Compass size={20} className="text-cyan-200" /><ChevronRight size={17} className="text-white/30 transition group-hover:text-white" /></div><div><p className="text-lg font-medium">{t('cards.navigator.title')}</p><p className="mt-1 text-xs text-white/45">{t('cards.navigator.desc')}</p></div></div></GlassCard>
          <GlassCard href="/ambient" className="min-h-[170px] lg:col-span-2"><div className="flex h-full items-end justify-between"><div><MoonStar size={20} className="mb-7 text-cyan-100" /><p className="text-lg font-medium">{t('cards.ambient.title')}</p><p className="mt-1 text-xs text-white/45">{t('cards.ambient.desc')}</p></div><Headphones size={42} strokeWidth={1} className="text-white/20" /></div></GlassCard>
          <GlassCard href="/my-libraries" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><LibraryBig size={20} className="text-cyan-200" /><span className="text-xs text-white/40">{t('cards.library.count', { count: summary?.totalWords ?? 0 })}</span></div><div><p className="text-lg font-medium">{t('cards.library.title')}</p><p className="mt-1 text-xs text-white/45">{t('cards.library.desc')}</p></div></div></GlassCard>
          <GlassCard href="/dashboard" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><BarChart3 size={20} className="text-cyan-200" /><span className="text-xs text-white/40">{t('cards.report.viewAll')}</span></div><div><p className="text-lg font-medium">{t('cards.report.title')}</p><p className="mt-1 text-xs text-white/45">{t('cards.report.desc')}</p></div></div></GlassCard>
          <GlassCard href="/settings" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><Settings size={20} className="text-cyan-200" /><ChevronRight size={17} className="text-white/30 transition group-hover:text-white" /></div><div><p className="text-lg font-medium">{t('cards.settings.title')}</p><p className="mt-1 text-xs text-white/45">{t('cards.settings.desc')}</p></div></div></GlassCard>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_.75fr]"><GlassCard className="min-h-[180px]"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45"><Sparkles size={14} />{t('recent.title')}</div><Link href="/history" className="text-xs text-white/40 hover:text-white">{t('recent.history')} <ChevronRight size={13} className="inline" /></Link></div><div className="grid gap-2 sm:grid-cols-2">{(summary?.recent ?? []).slice(0, 4).map((item, index) => <div key={`${item.word}-${index}`} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${item.isCorrect ? 'bg-emerald-300/15 text-emerald-200' : 'bg-rose-300/15 text-rose-200'}`}><Check size={12} /></span><span className="text-white/75">{item.word}</span><span className="ml-auto text-white/30">{item.isCorrect ? t('recent.consolidated') : t('recent.revisit')}</span></div>)}{(!summary?.recent || summary.recent.length === 0) && <p className="text-sm text-white/40">{t('recent.empty')}</p>}</div></GlassCard><GlassCard href="/passport" className="min-h-[180px] bg-[#11181d]/75"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><Waypoints size={19} className="text-cyan-200" /><span className="text-xs text-white/35">Learning Passport</span></div><div><p className="text-xl" style={{ fontFamily: "'Instrument Serif', serif" }}>{t('passport.title')}</p><p className="mt-2 text-xs leading-relaxed text-white/45">{t('passport.desc')}</p></div></div></GlassCard></section>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-white/35"><span className="h-1.5 w-5 rounded-full bg-white/80" /><span className="h-1.5 w-1.5 rounded-full bg-white/30" /><span className="h-1.5 w-1.5 rounded-full bg-white/30" /></div>
      </main>
      <style jsx>{`
        .home-bg-enter {
          animation: homeBgIn 0.7s ease both;
        }
        @keyframes homeBgIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        [data-home-theme='day'] .home-card {
          border-color: rgba(15, 23, 42, 0.14) !important;
          background: rgba(255, 255, 255, 0.84) !important;
          color: #0f172a !important;
          box-shadow: 0 22px 55px rgba(15, 23, 42, 0.14) !important;
        }
        [data-home-theme='day'] .home-card:hover {
          border-color: rgba(15, 23, 42, 0.28) !important;
          background: rgba(255, 255, 255, 0.96) !important;
        }
        [data-home-theme='day'] nav a,
        [data-home-theme='day'] header > div:first-child a,
        [data-home-theme='day'] header > button {
          color: #0f172a !important;
        }
        [data-home-theme='day'] nav button {
          color: #0f172a !important;
          border-color: rgba(15, 23, 42, 0.16) !important;
          background-color: rgba(255, 255, 255, 0.56) !important;
        }
        [data-home-theme='day'] header > div:first-child a,
        [data-home-theme='day'] nav a:last-child {
          border-color: rgba(15, 23, 42, 0.16) !important;
          background-color: rgba(255, 255, 255, 0.56) !important;
        }
        [data-home-theme='day'] [class~='text-white'],
        [data-home-theme='day'] [class~='text-white/75'],
        [data-home-theme='day'] [class~='text-white/65'],
        [data-home-theme='day'] [class~='text-white/55'],
        [data-home-theme='day'] [class~='text-white/50'],
        [data-home-theme='day'] [class~='text-white/45'],
        [data-home-theme='day'] [class~='text-white/40'],
        [data-home-theme='day'] [class~='text-white/35'],
        [data-home-theme='day'] [class~='text-white/30'],
        [data-home-theme='day'] [class~='text-white/20'] {
          color: rgba(15, 23, 42, 0.72) !important;
        }
        [data-home-theme='day'] [class~='text-white'] { color: #0f172a !important; }
        [data-home-theme='day'] [class~='border-white/10'],
        [data-home-theme='day'] [class~='border-white/15'],
        [data-home-theme='day'] [class~='border-white/20'] {
          border-color: rgba(15, 23, 42, 0.14) !important;
        }
        [data-home-theme='day'] [class~='bg-white/10'],
        [data-home-theme='day'] [class~='bg-white/[0.04]'],
        [data-home-theme='day'] [class~='bg-black/25'],
        [data-home-theme='day'] [class~='bg-black/30'] {
          background-color: rgba(15, 23, 42, 0.07) !important;
        }
      `}</style>
    </div>
  );
}
