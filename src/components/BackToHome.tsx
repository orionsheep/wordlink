'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const HIDDEN_PREFIXES = [
  '/',
  '/home',
  '/login',
  '/reset-password',
  '/auth',
  '/admin',
  '/quiz',
  '/word',
  '/graph',
  '/immersive',
];

export default function BackToHome() {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  if (pathname.startsWith('/read/')) return null;

  const isStudy = pathname === '/study' || pathname.startsWith('/study/');
  const isAmbient = pathname === '/ambient' || pathname.startsWith('/ambient/');
  const position = isAmbient
    ? 'right-4 top-4 md:right-8 md:top-6'
    : isStudy
      ? 'left-4 top-16 md:left-[76px] md:top-16'
      : 'left-4 top-4 md:left-[76px] md:top-4';

  return (
    <Link
      href="/home"
      aria-label="Back to home"
      title="Back to home"
      className={`fixed z-[120] inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3.5 py-2 text-xs text-white/75 shadow-lg backdrop-blur-md transition hover:border-white/30 hover:bg-black/85 hover:text-white ${position}`}
    >
      <ArrowLeft size={14} />
      Home
    </Link>
  );
}
