'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowRight, BarChart3, BookOpenText, Check, ChevronRight, Compass, Headphones, LibraryBig, LogOut, Moon,
  RotateCcw, Search, Settings, Sun, Target, Waypoints,
} from 'lucide-react';
import type { ReaderArticle } from '@/lib/reader-engine/types';
import { cachedFetch, cacheDelete } from '@/lib/client-cache';
import { useTheme } from '@/context/ThemeContext';
import { GROUP_COLORS, groupOf, type GraphData, type RelationGroup } from '@/lib/graph-shared';

interface DueWord { word: string; stage: string; memoryStrength: number; }
interface HomeSummary {
  streak: number;
  totalWords: number;
  dueWords: DueWord[];
  stageCounts: Record<string, number>;
  todayQuiz: { count: number; correctRate: number | null };
  recent: Array<{ word: string; isCorrect: boolean; timestamp: string }>;
}

// ---------------------------------------------------------------------------
// Where the visitor left off: the study workspace keeps its browsing history in localStorage.
// ---------------------------------------------------------------------------

function readCurrentWord(): string | null {
  try {
    const history: unknown = JSON.parse(localStorage.getItem('dashboard_wordBrowsingHistory') ?? '[]');
    if (!Array.isArray(history) || history.length === 0) return null;
    const index = Number(localStorage.getItem('dashboard_wordBrowsingIndex'));
    const word = history[Number.isInteger(index) && index >= 0 && index < history.length ? index : history.length - 1];
    return typeof word === 'string' ? word : null;
  } catch {
    return null;
  }
}

const subscribeStorage = (notify: () => void) => {
  window.addEventListener('storage', notify);
  return () => window.removeEventListener('storage', notify);
};
const subscribeNothing = () => () => {};

// The greeting and the date follow the visitor's clock, which the server does not know: they appear once
// the page runs in the browser.
const useHour = () => useSyncExternalStore(subscribeNothing, () => new Date().getHours(), () => null);
const useToday = () => useSyncExternalStore(subscribeNothing, () => new Date().toDateString(), () => null);

function greetingKey(hour: number) {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// ---------------------------------------------------------------------------
// A small star map of the current word's neighbours, in the same jewels as the word atlas.
// ---------------------------------------------------------------------------

/** When a word is linked to the centre in several ways, the first group here wins (as in the atlas). */
const GROUP_ORDER: RelationGroup[] = ['family', 'antonym', 'synonym', 'near_synonym', 'spelling_similar'];

interface Constellation {
  word: string;
  gloss?: string;
  totals: Partial<Record<RelationGroup, number>>;
  stars: Array<{ id: string; group: RelationGroup }>;
}

function constellationOf(data: GraphData): Constellation | null {
  const center = data.nodes.find((n) => n.level === 0);
  if (!center) return null;
  const groups = new Map<string, RelationGroup>();
  for (const link of data.links) {
    if (link.source !== center.id || link.target === center.id) continue;
    const group = groupOf(link.type);
    const previous = groups.get(link.target);
    if (!previous || GROUP_ORDER.indexOf(group) < GROUP_ORDER.indexOf(previous)) groups.set(link.target, group);
  }
  const totals: Constellation['totals'] = {};
  const stars: Constellation['stars'] = [];
  for (const group of GROUP_ORDER) {
    const members = [...groups].filter(([, g]) => g === group).map(([id]) => id);
    if (!members.length) continue;
    totals[group] = members.length;
    // A few of each relation, so every colour shows.
    stars.push(...members.slice(0, 4).map((id) => ({ id, group })));
  }
  return { word: center.name || center.id, gloss: center.translation, totals, stars: stars.slice(0, 14) };
}

/** Jewel gradient stops for a relation colour: highlight, body, rim. */
function jewel(hex: string): [string, string, string] {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number, toward: number, t: number) => Math.round(((n >> shift) & 255) + (toward - ((n >> shift) & 255)) * t);
  const tone = (toward: number, t: number) => `rgb(${ch(16, toward, t)}, ${ch(8, toward, t)}, ${ch(0, toward, t)})`;
  return [tone(255, 0.55), hex, tone(0, 0.3)];
}

/** Stars where the atlas would put them: each relation in its own sector around the word. */
function placeStars(stars: Constellation['stars'], cx: number, cy: number) {
  const groups = GROUP_ORDER.filter((g) => stars.some((s) => s.group === g));
  const span = (Math.PI * 2) / Math.max(1, groups.length);
  return stars.map((star) => {
    const members = stars.filter((s) => s.group === star.group);
    const k = members.indexOf(star);
    const step = Math.min(0.36, (span * 0.7) / members.length);
    const angle = -Math.PI / 2.4 + groups.indexOf(star.group) * span + (k - (members.length - 1) / 2) * step;
    const r = 84 + (k % 2) * 26;
    return { ...star, x: cx + Math.cos(angle) * r * 1.5, y: cy + Math.sin(angle) * r * 0.86, first: k === 0 };
  });
}

/** Stars shown before any word has been opened. */
const SAMPLE_STARS: Constellation['stars'] = [
  { id: 'a', group: 'synonym' }, { id: 'b', group: 'synonym' }, { id: 'c', group: 'synonym' },
  { id: 'd', group: 'near_synonym' }, { id: 'e', group: 'near_synonym' }, { id: 'f', group: 'near_synonym' },
  { id: 'g', group: 'family' }, { id: 'h', group: 'family' },
  { id: 'i', group: 'spelling_similar' }, { id: 'j', group: 'spelling_similar' },
];

function MiniAtlas({ constellation, dark }: { constellation: Constellation | null; dark: boolean }) {
  const W = 400, H = 260, cx = W / 2, cy = H / 2;
  const placed = placeStars(constellation?.stars ?? SAMPLE_STARS, cx, cy);
  const centre: [string, string, string] = dark ? ['#e0f2fe', '#38bdf8', '#075985'] : ['#a7f3d0', '#1b6c53', '#0f3d2e'];
  const sample = !constellation;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="img" aria-label={constellation?.word ?? ''}>
      <defs>
        {[...new Set(placed.map((s) => s.group))].map((g) => {
          const [hi, body, rim] = jewel(GROUP_COLORS[g]);
          return (
            <radialGradient key={g} id={`home-jewel-${g}`} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor={hi} /><stop offset="55%" stopColor={body} /><stop offset="100%" stopColor={rim} />
            </radialGradient>
          );
        })}
        <radialGradient id="home-jewel-centre" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={centre[0]} /><stop offset="55%" stopColor={centre[1]} /><stop offset="100%" stopColor={centre[2]} />
        </radialGradient>
        <radialGradient id="home-glow">
          <stop offset="0%" stopColor={centre[1]} stopOpacity={dark ? 0.45 : 0.18} /><stop offset="100%" stopColor={centre[1]} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g opacity={sample ? 0.55 : 1}>
        {placed.map((s, i) => (
          <line
            key={`l-${s.id}`} x1={cx} y1={cy} x2={s.x} y2={s.y}
            stroke={GROUP_COLORS[s.group]} strokeOpacity={dark ? 0.4 : 0.5} strokeWidth={1}
            className="motion-safe:animate-[home-rise_.6s_ease-out_both]" style={{ animationDelay: `${120 + i * 35}ms` }}
          />
        ))}
        <circle cx={cx} cy={cy} r={56} fill="url(#home-glow)" />
        {placed.map((s, i) => (
          <g key={s.id} className="motion-safe:animate-[home-pop_.5s_cubic-bezier(.2,.9,.3,1.2)_both] [transform-box:fill-box] [transform-origin:center]" style={{ animationDelay: `${160 + i * 35}ms` }}>
            <circle cx={s.x} cy={s.y} r={6.5} fill={`url(#home-jewel-${s.group})`} />
            {!sample && s.first && (
              <text
                x={s.x} y={s.y + 21} textAnchor="middle" paintOrder="stroke" strokeWidth={4} strokeLinejoin="round"
                stroke={dark ? '#0d1219' : '#faf8f3'} className="fill-neutral-400 text-[12px]"
              >
                {s.id}
              </text>
            )}
          </g>
        ))}
        <circle cx={cx} cy={cy} r={15} fill="url(#home-jewel-centre)" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const SURFACE =
  'rounded-3xl border border-neutral-800/80 bg-neutral-900/60 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_22px_44px_-24px_rgba(8,12,10,0.45)] backdrop-blur-xl';

/** A card. `className` places it (grid span, height); the surface fills it. */
function Panel({ href, className = '', children }: { href?: string; className?: string; children: React.ReactNode }) {
  const body = (
    <div className={`group relative h-full overflow-hidden p-5 transition duration-300 hover:border-neutral-700 motion-safe:hover:-translate-y-0.5 sm:p-6 ${SURFACE}`}>
      {children}
    </div>
  );
  return href
    ? <Link href={href} className={`block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${className}`}>{body}</Link>
    : <div className={className}>{body}</div>;
}

function Stat({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1 text-neutral-100">
        <span className="text-[28px] leading-none tabular-nums" style={{ fontFamily: "'Instrument Serif', serif" }}>{value ?? '—'}</span>
        {unit && value !== null && <span className="text-xs text-neutral-500">{unit}</span>}
      </dd>
    </div>
  );
}

function Tile({ href, icon: Icon, tint, title, desc, meta }: {
  href: string; icon: typeof Compass; tint: string; title: string; desc: string; meta?: string;
}) {
  return (
    <Link href={href} className={`group flex h-full flex-col gap-5 p-4 outline-none transition duration-300 hover:border-neutral-700 focus-visible:ring-2 focus-visible:ring-emerald-400/60 motion-safe:hover:-translate-y-0.5 ${SURFACE} rounded-2xl`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}><Icon size={17} strokeWidth={1.8} /></span>
        {meta
          ? <span className="text-[11px] tabular-nums text-neutral-500">{meta}</span>
          : <ChevronRight size={16} className="text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-neutral-300" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">{desc}</p>
      </div>
    </Link>
  );
}

const STAGES = [
  { key: 'UNFAMILIAR', color: 'bg-rose-400' },
  { key: 'FAMILIAR', color: 'bg-amber-400' },
  { key: 'LEARNED', color: 'bg-sky-400' },
  { key: 'MASTERED', color: 'bg-emerald-400' },
] as const;

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
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={t('menu')} title={email ?? t('fallback')} className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/70 text-xs font-semibold text-neutral-200 transition hover:border-neutral-700 hover:text-neutral-50">
        {initial}
      </button>
      {open && (
        <div className={`absolute right-0 top-11 z-50 w-56 p-2 ${SURFACE} rounded-2xl bg-neutral-900/95`}>
          <div className="truncate px-2.5 py-2 text-[11px] text-neutral-500">{email ?? t('unavailable')}</div>
          <button type="button" onClick={handleLogout} disabled={pending} className="mt-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs text-rose-400 transition hover:bg-rose-400/10 disabled:opacity-50">
            <LogOut size={14} />
            {pending ? t('loggingOut') : t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** Faint stars behind the dark theme (a repeating tile, so it costs one small image). */
const STARS = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260">' +
  [[18, 30, 0.9], [84, 12, 0.6], [140, 58, 1.1], [222, 26, 0.7], [40, 120, 0.6], [110, 150, 0.9], [190, 118, 0.6],
    [244, 170, 1], [20, 212, 0.8], [96, 236, 0.6], [160, 206, 1.2], [230, 244, 0.6]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="white" fill-opacity="${0.18 + r * 0.25}"/>`).join('') +
  '</svg>',
)}")`;

export default function HomePage() {
  const t = useTranslations('homePage');
  const tg = useTranslations('graph.atlas.groups');
  const locale = useLocale();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [articles, setArticles] = useState<ReaderArticle[]>([]);
  const [constellation, setConstellation] = useState<Constellation | null>(null);
  const currentWord = useSyncExternalStore(subscribeStorage, readCurrentWord, () => null);
  const hour = useHour();
  const today = useToday();

  useEffect(() => {
    void fetch('/api/home/summary', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then(setSummary).catch(() => setSummary(null));
    void fetch('/api/articles').then((r) => (r.ok ? r.json() : [])).then((data) => setArticles(Array.isArray(data) ? data : [])).catch(() => setArticles([]));
  }, []);

  useEffect(() => {
    if (!currentWord) return;
    let live = true;
    fetch(`/api/fission?word=${encodeURIComponent(currentWord)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GraphData | null) => { if (live) setConstellation(data ? constellationOf(data) : null); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [currentWord]);

  const article = articles[0];
  const due = summary?.dueWords ?? [];
  const quizRate = summary?.todayQuiz.correctRate;
  const stageTotal = STAGES.reduce((sum, s) => sum + (summary?.stageCounts[s.key] ?? 0), 0);
  const shown = constellation && currentWord && constellation.word.toLowerCase() === currentWord.toLowerCase() ? constellation : null;
  const relatedTotal = shown ? Object.values(shown.totals).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const date = useMemo(
    () => (today ? new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(today)) : null),
    [today, locale],
  );
  const switchLabel = dark ? t('nav.switchToDay') : t('nav.switchToNight');

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-black text-neutral-100">
      {/* Backdrop: soft light from the corners, and faint stars at night */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: dark
            ? 'radial-gradient(70rem 40rem at 8% -12%, rgba(56,189,248,0.13), transparent 60%), radial-gradient(56rem 36rem at 96% -6%, rgba(139,92,246,0.11), transparent 58%), radial-gradient(80rem 46rem at 50% 118%, rgba(16,185,129,0.07), transparent 60%), linear-gradient(180deg, #070b12, #05070c)'
            : 'radial-gradient(70rem 40rem at 8% -12%, rgba(16,185,129,0.12), transparent 60%), radial-gradient(56rem 36rem at 96% -6%, rgba(245,158,11,0.10), transparent 58%), linear-gradient(180deg, #f3efe6, #efeae0)',
        }}
      />
      {dark && <div aria-hidden className="pointer-events-none fixed inset-0 opacity-70" style={{ backgroundImage: STARS }} />}

      {/* z-20 keeps the header above <main> (z-10): the account menu hangs over main and must stay clickable */}
      <header className="relative z-20 mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/70 text-lg italic text-neutral-100" style={{ fontFamily: "'Instrument Serif', serif" }}>L</span>
          <span className="hidden text-[11px] tracking-[0.28em] text-neutral-500 sm:block">LEXIVERSE · 语宙</span>
        </Link>
        <nav className="flex items-center gap-1 text-xs text-neutral-400">
          <Link href="/dashboard" className="hidden rounded-full px-3 py-2 transition hover:bg-neutral-900/70 hover:text-neutral-100 sm:block">{t('nav.reports')}</Link>
          <Link href="/settings" className="hidden rounded-full px-3 py-2 transition hover:bg-neutral-900/70 hover:text-neutral-100 sm:block">{t('nav.settings')}</Link>
          <Link href="/study" aria-label={t('nav.search')} title={t('nav.search')} className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-neutral-900/70 hover:text-neutral-100"><Search size={16} /></Link>
          <button type="button" onClick={toggleTheme} aria-label={switchLabel} title={switchLabel} className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-neutral-900/70 hover:text-neutral-100">
            {dark ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <div className="ml-1"><UserMenu /></div>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1180px] px-4 pb-28 pt-6 sm:px-6 sm:pt-10 md:pb-14">
        {/* Greeting and today's numbers */}
        <section className="mb-7 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className={`transition-opacity duration-500 ${hour === null ? 'opacity-0' : 'opacity-100'}`}>
            <p className="text-xs tracking-wide text-neutral-500">{date ?? ' '}</p>
            <h1 className="mt-1 text-[34px] leading-tight tracking-tight text-neutral-100 sm:text-[44px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
              {hour === null ? ' ' : t(`greeting.${greetingKey(hour)}`)}
            </h1>
            <p className="mt-1 text-sm text-neutral-400">{t('tagline')}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:gap-10">
            <Stat label={t('stats.streak')} value={summary ? summary.streak : null} unit={t('stats.days')} />
            <Stat label={t('stats.learning')} value={summary ? summary.totalWords : null} />
            <Stat label={t('stats.mastered')} value={summary ? summary.stageCounts.MASTERED ?? 0 : null} />
            <Stat label={t('stats.accuracy')} value={summary ? (quizRate === null ? '—' : `${quizRate}%`) : null} />
          </dl>
        </section>

        <section className="grid gap-4 lg:grid-cols-12">
          {/* Continue where the workspace was left */}
          <Panel href="/study" className="min-h-[300px] lg:col-span-7 lg:min-h-[340px]">
            <div className="flex h-full flex-col gap-4 sm:flex-row">
              <div className="flex flex-col justify-between gap-6 sm:w-[46%]">
                <div>
                  <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {currentWord ? t('continue.eyebrow') : t('continue.startEyebrow')}
                  </p>
                  {currentWord ? (
                    <>
                      <p className="mt-3 break-words text-5xl leading-none tracking-tight text-neutral-50" style={{ fontFamily: "'Instrument Serif', serif" }}>{currentWord}</p>
                      {shown?.gloss && <p className="mt-3 line-clamp-2 text-sm text-neutral-400">{shown.gloss}</p>}
                      {shown && relatedTotal > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {GROUP_ORDER.filter((g) => shown.totals[g]).map((g) => (
                            <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: GROUP_COLORS[g] }} />
                              {tg(g)} {shown.totals[g]}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-4xl leading-tight tracking-tight text-neutral-50" style={{ fontFamily: "'Instrument Serif', serif" }}>{t('continue.startTitle')}</p>
                      <p className="mt-3 text-sm text-neutral-400">{t('cards.startStudy.desc')}</p>
                    </>
                  )}
                </div>
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-medium text-neutral-950 shadow-[0_8px_24px_-10px_rgba(16,185,129,0.8)]">
                  {currentWord ? t('continue.enter') : t('continue.start')}
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
              <div className="relative h-52 min-h-0 flex-1 sm:h-auto">
                <MiniAtlas constellation={currentWord ? shown : null} dark={dark} />
                {shown && relatedTotal > 0 && (
                  <p className="absolute bottom-0 right-0 text-[11px] text-neutral-500">{t('continue.related', { count: relatedTotal })}</p>
                )}
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 lg:col-span-5">
            {/* Today's review */}
            <Panel href="/quiz?from=%2Fhome">
              <div className="flex items-start justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300">{t('cards.review.title')}</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/12 text-amber-300"><Target size={16} /></span>
              </div>
              {due.length > 0 ? (
                <>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="text-[44px] leading-none tabular-nums text-neutral-50" style={{ fontFamily: "'Instrument Serif', serif" }}>{due.length}</span>
                    <span className="text-sm text-neutral-400">{t('review.dueLabel')}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {due.slice(0, 4).map((d) => (
                      <span key={d.word} className="rounded-full bg-neutral-800/70 px-2 py-0.5 text-xs text-neutral-300">{d.word}</span>
                    ))}
                    {due.length > 4 && <span className="px-1 py-0.5 text-xs text-neutral-500">+{due.length - 4}</span>}
                  </div>
                </>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-neutral-300">
                  <Check size={16} className="text-emerald-400" />
                  {summary ? t('review.clear') : ' '}
                </p>
              )}
              {stageTotal > 0 && (
                <div className="mt-4">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-neutral-800">
                    {STAGES.map((s) => {
                      const n = summary?.stageCounts[s.key] ?? 0;
                      return n ? <span key={s.key} className={`${s.color} h-full`} style={{ width: `${(n / stageTotal) * 100}%` }} /> : null;
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                    {STAGES.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${s.color}`} />{t(`review.stages.${s.key}`)} {summary?.stageCounts[s.key] ?? 0}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-neutral-500">{t('cards.review.stats', { count: summary?.todayQuiz.count ?? 0, rate: quizRate ?? 0 })}</span>
                <span className="inline-flex items-center gap-1 font-medium text-amber-300">{t('review.start')}<ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
              </div>
            </Panel>

            {/* Continue reading */}
            <Panel href={article ? `/read/${article.id}` : '/read'}>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-sky-300"><BookOpenText size={14} />{t('continueReading')}</p>
                {article && <span className="text-[11px] text-neutral-500">{article.level} · {t('reading.words', { count: article.wordCount })}</span>}
              </div>
              <p className="mt-3 line-clamp-2 text-2xl leading-snug text-neutral-50" style={{ fontFamily: "'Instrument Serif', serif" }}>{article?.title ?? t('cards.pickArticle')}</p>
              <p className="mt-2 line-clamp-1 text-xs text-neutral-500">{article?.recommendationReason ?? t('cards.rmePick')}</p>
            </Panel>
          </div>
        </section>

        {/* Everything else */}
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile href="/ambient" icon={Headphones} tint="bg-indigo-400/12 text-indigo-300" title={t('cards.ambient.title')} desc={t('cards.ambient.desc')} />
          <Tile href="/my-libraries" icon={LibraryBig} tint="bg-emerald-400/12 text-emerald-300" title={t('cards.library.title')} desc={t('cards.library.desc')} meta={summary ? t('cards.library.count', { count: summary.totalWords }) : undefined} />
          <Tile href="/dashboard" icon={BarChart3} tint="bg-amber-400/12 text-amber-300" title={t('cards.report.title')} desc={t('cards.report.desc')} />
          <Tile href="/passport" icon={Waypoints} tint="bg-violet-400/12 text-violet-300" title={t('passport.badge')} desc={t('passport.desc')} />
          <Tile href="/settings" icon={Settings} tint="bg-neutral-700/40 text-neutral-300" title={t('cards.settings.title')} desc={t('cards.settings.desc')} />
        </section>

        {/* Recent activity, only once there is some */}
        {summary && summary.recent.length > 0 && (
          <section className={`mt-4 flex flex-wrap items-center gap-2 px-4 py-3 ${SURFACE} rounded-2xl`}>
            <span className="mr-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">{t('recent.title')}</span>
            {summary.recent.slice(0, 8).map((item, i) => (
              <span key={`${item.word}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800/60 px-2.5 py-1 text-xs text-neutral-300" title={item.isCorrect ? t('recent.consolidated') : t('recent.revisit')}>
                {item.isCorrect ? <Check size={12} className="text-emerald-400" /> : <RotateCcw size={11} className="text-amber-400" />}
                {item.word}
              </span>
            ))}
            <Link href="/history" className="ml-auto inline-flex items-center gap-0.5 text-xs text-neutral-500 transition hover:text-neutral-200">
              {t('recent.history')}<ChevronRight size={13} />
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
