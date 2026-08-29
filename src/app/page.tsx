'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import {
    ArrowUpRight,
    Check,
    Copy,
    Play,
    Sparkles,
    Volume2,
} from 'lucide-react';
import CosmicRotatingBackground from '@/components/CosmicRotatingBackground';

export default function HomePage() {
    const [copied, setCopied] = useState(false);
    const heroVideoRef = useRef<HTMLVideoElement>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText('https://wordlink.study');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative min-h-screen bg-black text-[#e5e7eb] font-sans antialiased selection:bg-white selection:text-black overflow-x-hidden">
            {/* ===== 全站无缝循环 Google Veo 3.1 动态星际背景 (Seamless Dual-Track Cosmic Video) ===== */}
            <CosmicRotatingBackground />

            {/* ===== 1. 顶部极简导航栏 (Luxury Dark Nav) ===== */}
            <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/60 border-b border-white/[0.08] transition-all">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <div className="w-8 h-8 rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-white font-serif italic text-lg shadow-sm group-hover:border-white/50 transition-colors">
                            L
                        </div>
                        <span className="font-serif italic text-xl tracking-wider text-white" style={{ fontFamily: "'Instrument Serif', serif" }}>
                            Lexiverse
                        </span>
                    </Link>

                    {/* Nav Links */}
                    <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-white/60">
                        <Link href="/home" className="hover:text-white transition-colors">Workspace</Link>
                        <Link href="/read" className="hover:text-white transition-colors flex items-center gap-1.5">
                            <span>Reading Hub</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] text-white/80 font-mono">RME-V5</span>
                        </Link>
                        <Link href="/quiz" className="hover:text-white transition-colors">AI Dictation</Link>
                        <Link href="/ambient" className="hover:text-white transition-colors flex items-center gap-1">
                            <span>Ambient</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] text-white/80">4 Seasons</span>
                        </Link>
                        <Link href="/passport" className="hover:text-white transition-colors">XAI Passport</Link>
                    </nav>

                    {/* Right CTA */}
                    <div className="flex items-center gap-4">
                        <Link
                            href="/login"
                            className="hidden sm:inline-flex text-xs font-medium text-white/60 hover:text-white transition-colors"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/home"
                            className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-white/90 transition-all flex items-center gap-1 active:scale-95 shadow-md shadow-white/10"
                        >
                            <span>Get Started</span>
                            <ArrowUpRight size={13} />
                        </Link>
                    </div>
                </div>
            </header>

            {/* ===== 2. HERO 区域 (Master Serif Typography & Actions) ===== */}
            <section className="relative pt-24 pb-12 px-6 text-center max-w-5xl mx-auto space-y-8 z-10">
                {/* Top Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/15 bg-black/40 backdrop-blur-md text-xs font-medium text-white/80">
                    <span className="px-2 py-0.5 rounded-full bg-white text-black text-[10px] font-bold uppercase tracking-wider">New</span>
                    <span className="text-white/70">Introducing AI-powered vocabulary fission & contextual self-healing</span>
                </div>

                {/* Master Headline in Instrument Serif */}
                <h1
                    className="text-6xl sm:text-8xl lg:text-[6.5rem] font-serif italic text-white tracking-tight leading-[1.0] drop-shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
                    style={{ fontFamily: "'Instrument Serif', serif" }}
                >
                    The Vocabulary System<br />
                    Your Mind Deserves
                </h1>

                {/* Subtext */}
                <p className="max-w-2xl mx-auto text-sm sm:text-base text-white/70 leading-relaxed font-normal drop-shadow-md">
                    Stunning cognitive topology. Blazing retention. Built by FSRS-6, refined by authentic contexts.
                    This is vocabulary learning, wildly reimagined.
                </p>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
                    <Link
                        href="/home"
                        className="px-8 py-3.5 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 shadow-xl active:scale-95"
                    >
                        <span>Get Started</span>
                        <ArrowUpRight size={13} />
                    </Link>

                    <Link
                        href="/ambient?mode=reading"
                        className="px-8 py-3.5 rounded-full text-xs font-medium text-white/70 hover:text-white transition-all flex items-center gap-2"
                    >
                        <span>Watch the Film</span>
                        <Play size={11} className="fill-current" />
                    </Link>
                </div>

                {/* 快捷指令 */}
                <div className="pt-2 flex items-center justify-center">
                    <div
                        onClick={handleCopy}
                        className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-black/60 border border-white/15 text-xs font-mono text-white/70 hover:text-white cursor-pointer transition-all group backdrop-blur-md"
                    >
                        <span className="text-white/40">$</span>
                        <span>open https://wordlink.study</span>
                        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-white/40 group-hover:text-white" />}
                    </div>
                </div>
            </section>

            {/* ===== 3. HERO 主演示视频 1 (Immersive 单词裂变图谱真实交互录屏) ===== */}
            <div className="relative w-full max-w-6xl mx-auto px-6 overflow-hidden z-10">
                <div className="relative rounded-3xl overflow-hidden border border-white/15 shadow-2xl shadow-purple-950/40 bg-black/90 backdrop-blur-2xl">
                    <video
                        ref={heroVideoRef}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-auto object-cover max-h-[600px] opacity-95"
                        src="/videos/immersive-graph-demo.mp4"
                    />
                </div>
            </div>

            {/* ===== 4. 信任背书栏 (Social Proof Bar) ===== */}
            <div className="relative z-10 py-16 text-center space-y-5 border-y border-white/[0.08] backdrop-blur-sm bg-black/30 mt-16">
                <div className="inline-block px-3 py-1 rounded-full border border-white/10 bg-white/[0.02] text-[11px] text-white/40 tracking-wider">
                    Trusted by learners aiming for
                </div>
                <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 text-2xl sm:text-3xl text-white/70 font-serif italic" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    <span>IELTS</span>
                    <span>TOEFL</span>
                    <span>GRE</span>
                    <span>Cambridge</span>
                    <span>Oxford</span>
                    <span>Harvard</span>
                </div>
            </div>

            {/* ===== 5. CAPABILITIES 核心特性区 (真实演示视频 Bento 矩阵) ===== */}
            <section className="relative z-10 max-w-7xl mx-auto px-6 py-28 space-y-28">
                {/* Section Header */}
                <div className="text-center space-y-3 max-w-2xl mx-auto">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-white/40 border border-white/10 px-3 py-1 rounded-full bg-white/[0.02]">
                        Capabilities
                    </span>
                    <h2
                        className="text-4xl sm:text-6xl font-serif italic text-white tracking-tight"
                        style={{ fontFamily: "'Instrument Serif', serif" }}
                    >
                        Pro features. Zero complexity.
                    </h2>
                </div>

                {/* ===== Bento Row 1: 左文 + 右演示视频 2 (Ambient 语境文章沉浸听读) ===== */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-5 space-y-5">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">01 / Contextual Immersion</span>
                        <h3
                            className="text-3xl sm:text-4xl font-serif italic text-white leading-tight"
                            style={{ fontFamily: "'Instrument Serif', serif" }}
                        >
                            Designed for cognition.<br />
                            Built to retain.
                        </h3>
                        <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                            Every sentence is intentional. In our four-season ambient focus space, sentences emerge with liquid-glass staggered reveal, paired with synthesized Web Audio nature soundscapes and authentic IndexTTS voices.
                        </p>
                        <Link
                            href="/ambient?mode=reading"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/15 text-xs text-white/80 hover:text-white hover:border-white/40 transition-all backdrop-blur-md"
                        >
                            <span>Explore Reading Space</span>
                            <ArrowUpRight size={12} />
                        </Link>
                    </div>

                    {/* 演示视频 2: 沉浸式文章听读 */}
                    <div className="lg:col-span-7 rounded-3xl border border-white/15 bg-black/70 overflow-hidden shadow-2xl relative group backdrop-blur-2xl">
                        <video
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            className="w-full h-auto object-cover max-h-[420px] opacity-90 group-hover:opacity-100 transition-opacity"
                            src="/videos/ambient-reading-demo.mp4"
                        />
                    </div>
                </div>

                {/* ===== Bento Row 2: 左演示视频 3 (Ambient 单词听力流与 Playlist Hub) + 右文 ===== */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                    {/* 演示视频 3: 沉浸式单词听力流 */}
                    <div className="lg:col-span-7 rounded-3xl border border-white/15 bg-black/70 overflow-hidden shadow-2xl relative group backdrop-blur-2xl order-2 lg:order-1">
                        <video
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            className="w-full h-auto object-cover max-h-[420px] opacity-90 group-hover:opacity-100 transition-opacity"
                            src="/videos/ambient-words-demo.mp4"
                        />
                    </div>

                    <div className="lg:col-span-5 space-y-5 order-1 lg:order-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400">02 / Spaced Passive Input</span>
                        <h3
                            className="text-3xl sm:text-4xl font-serif italic text-white leading-tight"
                            style={{ fontFamily: "'Instrument Serif', serif" }}
                        >
                            It gets smarter.<br />
                            Automatically.
                        </h3>
                        <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                            Your vocabulary stream evolves with your learning state. The Playlist Vocabulary Hub allows real-time syllabus selection, shuffle curation, and cadence pacing (8s/12s/16s). Zero UI discipline ensures seamless passive learning.
                        </p>
                        <Link
                            href="/ambient"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/15 text-xs text-white/80 hover:text-white hover:border-white/40 transition-all backdrop-blur-md"
                        >
                            <span>Launch Word Stream</span>
                            <ArrowUpRight size={12} />
                        </Link>
                    </div>
                </div>
            </section>

            {/* ===== 6. 底部流动金属波纹与最终号召 (Bottom Liquid Ribbon & Final CTA) ===== */}
            <section className="relative z-10 py-28 px-6 text-center border-t border-white/[0.08] overflow-hidden backdrop-blur-sm bg-black/40">
                {/* 3D Fluid Glass Ribbon */}
                <div className="max-w-xl mx-auto mb-10 opacity-75">
                    <img
                        src="/fluid-ribbon.png"
                        alt="Liquid chrome wave"
                        className="w-full h-auto mx-auto object-contain max-h-32"
                    />
                </div>

                <div className="max-w-3xl mx-auto space-y-6 relative z-10">
                    <h2
                        className="text-5xl sm:text-7xl font-serif italic text-white tracking-tight"
                        style={{ fontFamily: "'Instrument Serif', serif" }}
                    >
                        You dream it. We anchor it.
                    </h2>
                    <p className="text-xs sm:text-sm text-white/65 max-w-xl mx-auto leading-relaxed">
                        Connect every word into a second brain. FSRS-6 handles memory curves, RME-V5 serves the contexts, and AI Dictation closes the loop.
                    </p>

                    <div className="pt-4">
                        <Link
                        href="/home"
                            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-white/90 transition-all shadow-xl shadow-white/10 active:scale-95"
                        >
                            <span>Get Started</span>
                            <ArrowUpRight size={14} />
                        </Link>
                    </div>
                </div>
            </section>

            {/* ===== 7. 极简黑夜页脚 (Minimal Luxury Footer) ===== */}
            <footer className="relative z-10 border-t border-white/[0.08] bg-black/80 py-12 px-6 backdrop-blur-2xl">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-white/40">
                    <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full border border-white/30 flex items-center justify-center font-serif italic text-[11px] text-white">
                            L
                        </div>
                        <span className="font-serif italic text-white/80 text-sm" style={{ fontFamily: "'Instrument Serif', serif" }}>Lexiverse 语宙</span>
                        <span>· © 2026 AI for SDGs Project · UNU Macau</span>
                    </div>

                    <div className="flex items-center gap-6">
                        <Link href="/home" className="hover:text-white transition-colors">Workspace</Link>
                        <Link href="/read" className="hover:text-white transition-colors">Reading Hub</Link>
                        <Link href="/quiz" className="hover:text-white transition-colors">AI Dictation</Link>
                        <Link href="/ambient" className="hover:text-white transition-colors">Ambient</Link>
                        <Link href="/passport" className="hover:text-white transition-colors">Passport</Link>
                        <Link href="/login" className="hover:text-white transition-colors">Login</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
