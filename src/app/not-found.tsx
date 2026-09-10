import Link from 'next/link';
import { Home, Compass } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center p-6 text-center">
            <div className="glass-card max-w-md w-full p-10 rounded-3xl border border-neutral-800 bg-neutral-950/80 shadow-2xl space-y-6">
                <div className="text-6xl font-serif italic" style={{ fontFamily: "'Instrument Serif', serif" }}>404</div>
                <div className="space-y-2">
                    <h2 className="text-lg font-bold tracking-tight">This page drifted off the star map</h2>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                        The page you are looking for does not exist or has moved.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <Link
                        href="/"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-900/30 transition-all hover:scale-105"
                    >
                        <Home size={14} />
                        <span>Back to home</span>
                    </Link>
                    <Link
                        href="/study"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all"
                    >
                        <Compass size={14} />
                        <span>Open workbench</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
