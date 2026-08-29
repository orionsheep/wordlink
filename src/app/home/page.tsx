'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, BookOpenText, Check, ChevronRight, Compass, Headphones, LibraryBig, Moon, MoonStar, Play, Plus, Search, Settings, Sparkles, Sun, Target, Waypoints } from 'lucide-react';
import type { ReaderArticle } from '@/lib/reader-engine/types';

interface DueWord { word: string; stage: string; memoryStrength: number; }
interface HomeSummary {
  streak: number;
  totalWords: number;
  dueWords: DueWord[];
  stageCounts: Record<string, number>;
  todayQuiz: { count: number; correctRate: number | null };
  recent: Array<{ word: string; isCorrect: boolean; timestamp: string }>;
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function GlassCard({ href, className = '', children }: { href?: string; className?: string; children: React.ReactNode }) {
  const card = <div className={`home-card group relative h-full overflow-hidden rounded-[24px] border border-white/10 bg-[#10151a]/80 p-5 text-white shadow-2xl shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#151b20]/90 ${className}`}>{children}</div>;
  return href ? <Link href={href} className="block h-full">{card}</Link> : card;
}

export default function HomePage() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [articles, setArticles] = useState<ReaderArticle[]>([]);
  const [articleIndex, setArticleIndex] = useState(0);
  const [dayMode, setDayMode] = useState(false);

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

  return (
    <div className={`relative min-h-[100dvh] overflow-hidden text-white transition-colors duration-500 ${dayMode ? 'bg-[#dfe9ed]' : 'bg-[#071016]'}`} data-home-theme={dayMode ? 'day' : 'night'}>
      <div
        className={`pointer-events-none absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${dayMode ? 'opacity-0' : 'opacity-100'}`}
        style={{ backgroundImage: "url('/lexiverse-home-night.png')" }}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${dayMode ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundImage: "url('/lexiverse-home-day.jpg')" }}
      />
      <div className={`pointer-events-none absolute inset-0 transition duration-700 ${dayMode ? 'bg-[linear-gradient(180deg,rgba(226,239,243,.2),rgba(226,239,243,.62)_72%,#dfe9ed)]' : 'bg-[linear-gradient(180deg,rgba(4,9,14,.3),rgba(4,9,14,.68)_72%,#05080b)]'}`} />

      <header className="home-header relative z-10 flex h-16 items-center justify-between px-4 sm:px-7 lg:px-10">
        <div className="flex items-center gap-3"><Link href="/" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-lg italic text-white backdrop-blur-md transition hover:bg-white/10" style={{ fontFamily: "'Instrument Serif', serif" }}>L</Link><div className="hidden text-xs tracking-[0.2em] text-white/50 sm:block">LEXIVERSE · 语宙</div></div>
        <button type="button" onClick={toggleDayMode} aria-pressed={dayMode} aria-label={dayMode ? '切换到黑夜模式' : '切换到白天模式'} title={dayMode ? '切换到黑夜模式' : '切换到白天模式'} className={`absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur-md transition ${dayMode ? 'border-amber-200/70 bg-white/60 text-slate-700' : 'border-white/15 bg-black/35 text-white/75'}`}>
          <span className={`relative flex h-5 w-9 items-center rounded-full p-0.5 transition ${dayMode ? 'bg-amber-200/80' : 'bg-slate-700/80'}`}><span className={`flex h-4 w-4 items-center justify-center rounded-full shadow-sm transition-transform ${dayMode ? 'translate-x-4 bg-white text-amber-500' : 'translate-x-0 bg-slate-100 text-slate-700'}`}>{dayMode ? <Sun size={11} /> : <Moon size={11} />}</span></span>
          <span>{dayMode ? '白天' : '黑夜'}</span>
        </button>
        <nav className="flex items-center gap-1.5 text-[11px] text-white/65"><Link href="/dashboard" className="hidden rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white sm:block">报告</Link><Link href="/settings" className="hidden rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white sm:block">设置</Link><Link href="/navigator" aria-label="搜索" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/25 transition hover:bg-white/10 hover:text-white"><Search size={15} /></Link></nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[1240px] px-4 pb-10 pt-8 sm:px-7 sm:pt-12 lg:px-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs uppercase tracking-[0.28em] text-white/45">Mission control</p><h1 className="text-3xl font-medium tracking-tight text-white sm:text-4xl" style={{ fontFamily: "'Instrument Serif', serif" }}>{timeGreeting()}</h1><p className="mt-2 text-sm text-white/55">把今天要做的事，放在一个安静的空间里。</p></div><div className="hidden items-center gap-2 text-[11px] text-white/45 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />系统在线</div></div>

        <section className="grid auto-rows-[minmax(150px,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GlassCard href="/study" className="min-h-[190px] bg-[#132338]/75"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"><Plus size={21} /></span><ArrowUpRight size={17} className="text-white/35 transition group-hover:text-white" /></div><div><p className="text-lg font-medium">开始学习</p><p className="mt-1 text-xs text-white/45">打开星图工作台，继续你的词汇路径</p></div></div></GlassCard>
          <GlassCard href={article ? `/read/${article.id}` : '/read'} className="min-h-[190px] lg:col-span-2"><div className="flex h-full flex-col justify-between"><div className="flex items-start justify-between"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-200/75"><BookOpenText size={14} />Continue reading</div><Play size={17} className="text-white/35 transition group-hover:text-cyan-200" /></div><div><p className="line-clamp-2 text-2xl leading-tight" style={{ fontFamily: "'Instrument Serif', serif" }}>{article?.title ?? '挑一篇文章，进入你的下一个语境'}</p><p className="mt-2 text-xs text-white/45">{article?.recommendationReason ?? 'RME-V5 为你挑选的下一篇文章'}</p></div></div></GlassCard>
          <GlassCard href="/quiz?from=%2Fhome" className="min-h-[190px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-300/15 text-amber-200"><Target size={20} /></span><span className="text-xs text-amber-200/80">{dueCount} 待复习</span></div><div><p className="text-lg font-medium">今日复习</p><p className="mt-1 text-xs text-white/45">{summary?.todayQuiz.count ?? 0} 次练习 · 正确率 {quizRate}%</p></div></div></GlassCard>
          <GlassCard href="/navigator" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><Compass size={20} className="text-cyan-200" /><ChevronRight size={17} className="text-white/30 transition group-hover:text-white" /></div><div><p className="text-lg font-medium">认知导航</p><p className="mt-1 text-xs text-white/45">从已掌握的词，找到通往目标的路径</p></div></div></GlassCard>
          <GlassCard href="/ambient" className="min-h-[170px] lg:col-span-2"><div className="flex h-full items-end justify-between"><div><MoonStar size={20} className="mb-7 text-cyan-100" /><p className="text-lg font-medium">屏保听读</p><p className="mt-1 text-xs text-white/45">让文章在背景里慢慢发生</p></div><Headphones size={42} strokeWidth={1} className="text-white/20" /></div></GlassCard>
          <GlassCard href="/my-libraries" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><LibraryBig size={20} className="text-cyan-200" /><span className="text-xs text-white/40">{summary?.totalWords ?? 0} 词</span></div><div><p className="text-lg font-medium">我的词库</p><p className="mt-1 text-xs text-white/45">管理你的个人词汇资产</p></div></div></GlassCard>
          <GlassCard href="/dashboard" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><BarChart3 size={20} className="text-cyan-200" /><span className="text-xs text-white/40">查看全部</span></div><div><p className="text-lg font-medium">学习报告</p><p className="mt-1 text-xs text-white/45">掌握度、连续学习与最近动态</p></div></div></GlassCard>
          <GlassCard href="/settings" className="min-h-[170px]"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><Settings size={20} className="text-cyan-200" /><ChevronRight size={17} className="text-white/30 transition group-hover:text-white" /></div><div><p className="text-lg font-medium">设置</p><p className="mt-1 text-xs text-white/45">调整显示、声音与学习偏好</p></div></div></GlassCard>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_.75fr]"><GlassCard className="min-h-[180px]"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/45"><Sparkles size={14} />最近动态</div><Link href="/history" className="text-xs text-white/40 hover:text-white">历史记录 <ChevronRight size={13} className="inline" /></Link></div><div className="grid gap-2 sm:grid-cols-2">{(summary?.recent ?? []).slice(0, 4).map((item, index) => <div key={`${item.word}-${index}`} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${item.isCorrect ? 'bg-emerald-300/15 text-emerald-200' : 'bg-rose-300/15 text-rose-200'}`}><Check size={12} /></span><span className="text-white/75">{item.word}</span><span className="ml-auto text-white/30">{item.isCorrect ? '已巩固' : '待再看'}</span></div>)}{(!summary?.recent || summary.recent.length === 0) && <p className="text-sm text-white/40">完成一次学习后，这里会出现你的轨迹。</p>}</div></GlassCard><GlassCard href="/passport" className="min-h-[180px] bg-[#11181d]/75"><div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><Waypoints size={19} className="text-cyan-200" /><span className="text-xs text-white/35">Learning Passport</span></div><div><p className="text-xl" style={{ fontFamily: "'Instrument Serif', serif" }}>你的语境正在生长。</p><p className="mt-2 text-xs leading-relaxed text-white/45">打开学习护照，查看你的认知雷达与成长轨迹。</p></div></div></GlassCard></section>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-white/35"><span className="h-1.5 w-5 rounded-full bg-white/80" /><span className="h-1.5 w-1.5 rounded-full bg-white/30" /><span className="h-1.5 w-1.5 rounded-full bg-white/30" /></div>
      </main>
      <style jsx>{`
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
