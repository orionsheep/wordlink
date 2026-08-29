'use client';

import './apogee.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, X } from 'lucide-react';

const BAR_HEIGHTS = [
  23, 40, 53, 40, 33, 14, 7, 17, 75, 65,
  88, 75, 65, 47, 33, 88, 4, 7, 9, 14,
  95, 65, 79, 37, 7, 40, 17, 20, 62, 47,
  92, 72,
];

type Direction = 'up' | 'down' | 'left' | 'right' | 'scale';

function Animate({
  children,
  delay = 0,
  className = '',
  direction = 'up',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: Direction;
}) {
  const directionClasses: Record<Direction, string> = {
    up: 'animate-fade-up',
    down: 'animate-fade-down',
    left: 'animate-fade-left',
    right: 'animate-fade-right',
    scale: 'animate-fade-scale',
  };

  return (
    <div
      className={`opacity-0 ${directionClasses[direction]} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function RevenueCard() {
  const maxHeight = Math.max(...BAR_HEIGHTS);

  return (
    <Animate delay={900} direction="scale" className="w-full max-w-[405px] mx-auto lg:mx-0">
      <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] p-5 sm:p-8 pb-5 sm:pb-6">
        <p className="text-white text-[16px] sm:text-[20px] font-[450] leading-[20px] mb-3 sm:mb-4">
          Revenue Growth
        </p>
        <p className="mb-2 sm:mb-3">
          <span className="text-white text-[28px] sm:text-[46px] font-[450] leading-[1]">$14,205,890</span>
          <span className="text-white/20 text-[28px] sm:text-[46px] font-[450] leading-[1]">.00</span>
        </p>
        <div className="flex items-center gap-[10px] mb-6 sm:mb-8">
          <span className="px-[6px] py-[7px] bg-white/20 rounded-[6px] text-white text-[12px] sm:text-[14px] font-[450] leading-[14px]">
            +32.4%
          </span>
          <span className="text-white/80 text-[12px] sm:text-[14px] font-[450] leading-[14px] opacity-70">
            vs. previous period ($10.7M)
          </span>
        </div>

        <div className="relative">
          {/* Bars */}
          <div className="flex items-end gap-[1.5px] h-[80px] sm:h-[100px]">
            {BAR_HEIGHTS.map((h, i) => {
              const isProjected = i >= 28;
              const heightPercent = (h / maxHeight) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-[0.5px] animate-bar-grow origin-bottom"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: isProjected ? 'rgba(255,255,255,0.1)' : 'white',
                    animationDelay: `${1100 + i * 30}ms`,
                  }}
                />
              );
            })}
          </div>

          {/* Vertical gridlines */}
          <div className="absolute inset-0 pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-white/10"
                style={{ left: `${((i + 1) / 5) * 100}%` }}
              />
            ))}
          </div>

          {/* Time axis */}
          <div className="flex justify-between mt-3">
            {['10:00', '12:00', '14:00', '16:00', '16:00'].map((label, i) => (
              <span
                key={i}
                className="text-[9px] sm:text-[10px] font-[450] leading-[10px] text-white/80"
                style={{ opacity: i >= 3 ? 0.4 : 1 }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Animate>
  );
}

interface SessionUser {
  id?: string;
  email?: string;
  name?: string;
}

function useAuthCta() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setAuthChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 未登录时路由守卫会把非认证页弹回 welcome 兜底页,
  // 因此所有出口在未登录时直接指向 /login,避免死循环
  const loggedIn = authChecked && !!user;
  return {
    loggedIn,
    displayName: user?.name || user?.email?.split('@')[0] || '',
    ctaHref: loggedIn ? '/home' : '/login',
    ctaLabel: loggedIn ? '继续学习' : 'Book a demo',
  };
}

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_092641_de52eb87-daf2-41db-92cb-7a56eae012a5.mp4';

export default function ApogeeHero() {
  const { loggedIn, displayName, ctaHref } = useAuthCta();

  return (
    <section
      className="relative w-full h-screen overflow-hidden bg-[#080A19]"
      style={{ fontFamily: "'Suisse Intl', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* Background video */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
      />

      <div className="relative z-10 h-full flex flex-col">
        <Nav loggedIn={loggedIn} displayName={displayName} ctaHref={ctaHref} />

        <div className="flex-1 flex items-center py-8">
          <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10 lg:gap-12">
            <div className="max-w-[593px]">
              <Animate delay={300} direction="up">
                <h1 className="text-white text-[36px] sm:text-[52px] md:text-[64px] lg:text-[72px] font-normal leading-[0.95] mb-5 sm:mb-8">
                  Elevate your essential data to new heights
                </h1>
              </Animate>

              <Animate delay={500} direction="up">
                <p className="text-white/80 text-[16px] sm:text-[18px] md:text-[20px] font-[450] leading-[1.3] max-w-[370px] mb-7 sm:mb-10">
                  Advanced reasoning systems and predictive models built for the unknown
                </p>
              </Animate>

              <Animate delay={700} direction="up">
                <div className="flex flex-wrap gap-3 sm:gap-4">
                  <Link
                    href={ctaHref}
                    className="h-[46px] sm:h-[51px] px-5 sm:px-[27px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-opacity hover:opacity-90 inline-flex items-center"
                  >
                    Book a demo
                  </Link>
                  <Link
                    href="/login"
                    className="h-[46px] sm:h-[51px] px-5 sm:px-[27px] rounded-[12px] border border-white text-white text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-opacity hover:opacity-80 inline-flex items-center"
                  >
                    Talk with the team
                  </Link>
                </div>
              </Animate>
            </div>

            <RevenueCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function Nav({
  loggedIn,
  displayName,
  ctaHref,
}: {
  loggedIn: boolean;
  displayName: string;
  ctaHref: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <nav className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px] pt-[20px] sm:pt-[30px] flex items-center justify-between relative z-50">
        {/* Logo */}
        <Animate delay={0} direction="down">
          <div className="flex items-center gap-2.5">
            <svg
              width="28"
              height="28"
              viewBox="0 0 256 256"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="sm:w-[32px] sm:h-[32px]"
            >
              <path
                d="M 256 256 L 178 256 C 150.386 256 128 233.614 128 206 L 128 256 L 0 256 L 0 192 C 0 156.654 28.654 128 64 128 C 99.346 128 128 156.654 128 192 L 128 128 L 256 128 Z M 78 0 C 105.614 0 128 22.386 128 50 L 128 0 L 256 0 L 256 64 C 256 99.346 227.346 128 192 128 C 156.654 128 128 99.346 128 64 L 128 128 L 0 128 L 0 0 Z"
                fill="white"
              />
            </svg>
            <span className="text-white text-[22px] sm:text-[26px] font-[450] leading-none tracking-[-0.02em]">
              Apogee
            </span>
          </div>
        </Animate>

        {/* Center nav pill (desktop) */}
        <Animate delay={100} direction="down" className="hidden lg:block">
          <div className="h-[52px] px-6 flex items-center gap-[30px] bg-[rgba(10,7,7,0.35)] rounded-[11px] backdrop-blur-[17px]">
            <button className="flex items-center gap-[5px] text-white/80 text-[14px] font-[450] leading-[14px] hover:text-white transition-colors">
              Platform
              <ChevronDown className="w-[10px] h-[10px] opacity-80" />
            </button>
            <span className="text-white/80 text-[14px] font-[450] leading-[14px] hover:text-white transition-colors cursor-pointer">
              Pricing
            </span>
            <span className="text-white/80 text-[14px] font-[450] leading-[14px] hover:text-white transition-colors cursor-pointer">
              Resources
            </span>
            <span className="text-white/80 text-[14px] font-[450] leading-[14px] hover:text-white transition-colors cursor-pointer">
              Blog
            </span>
          </div>
        </Animate>

        {/* Right auth pill (desktop) */}
        <Animate delay={200} direction="down" className="hidden lg:block">
          <div className="h-[52px] p-[3px] bg-[rgba(0,0,0,0.35)] rounded-[13px] backdrop-blur-[17px] flex items-center gap-[5px]">
            {loggedIn ? (
              <span className="h-[46px] px-6 rounded-[11px] text-white/70 text-[14px] font-[450] leading-[46px]">
                你好,{displayName}
              </span>
            ) : (
              <Link
                href="/login"
                className="h-[46px] px-6 rounded-[11px] text-white text-[14px] font-[450] leading-[46px] hover:bg-white/5 transition-colors inline-flex items-center"
              >
                Login
              </Link>
            )}
            <Link
              href={ctaHref}
              className="h-[46px] px-6 bg-[#E9E9E9] rounded-[11px] text-[#0A0707] text-[14px] font-[450] leading-[46px] hover:bg-white transition-colors inline-flex items-center"
            >
              Book a demo
            </Link>
          </div>
        </Animate>

        {/* Mobile hamburger */}
        <Animate delay={100} direction="down" className="lg:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
            className="w-[44px] h-[44px] flex items-center justify-center rounded-[11px] bg-[rgba(10,7,7,0.35)] backdrop-blur-[17px] transition-colors hover:bg-white/10"
          >
            <div className="relative w-5 h-5">
              <Menu
                className={`w-5 h-5 text-white absolute inset-0 transition-all duration-300 ease-out ${
                  isOpen ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
                }`}
              />
              <X
                className={`w-5 h-5 text-white absolute inset-0 transition-all duration-300 ease-out ${
                  isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'
                }`}
              />
            </div>
          </button>
        </Animate>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? 'visible' : 'invisible'
        }`}
      >
        {/* Backdrop */}
        <div
          onClick={() => setIsOpen(false)}
          className={`absolute inset-0 bg-[#080A19]/90 backdrop-blur-[24px] transition-opacity duration-500 ${
            isOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Panel */}
        <div
          className={`absolute top-[76px] sm:top-[86px] left-4 right-4 sm:left-6 sm:right-6 bg-[rgba(17,16,15,0.6)] backdrop-blur-[30px] rounded-[20px] border border-white/[0.06] p-6 sm:p-8 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] origin-top ${
            isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-[0.97]'
          }`}
        >
          <div className="flex flex-col gap-1">
            {['Platform', 'Pricing', 'Resources', 'Blog'].map((item, i) => (
              <a
                key={item}
                href="#"
                className={`flex items-center justify-between px-4 py-4 rounded-[12px] text-white/90 text-[18px] font-[450] hover:bg-white/[0.06] transition-all duration-300 ${
                  isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-3'
                }`}
                style={{ transitionDelay: isOpen ? `${100 + i * 50}ms` : '0ms' }}
              >
                {item}
                {item === 'Platform' && <ChevronDown className="w-4 h-4 opacity-50" />}
              </a>
            ))}
          </div>

          <div className="h-px bg-white/10 my-5" />

          <div
            className={`flex flex-col gap-3 transition-all duration-300 ${
              isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
            style={{ transitionDelay: isOpen ? '350ms' : '0ms' }}
          >
            <Link
              href={ctaHref}
              className="w-full h-[50px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[15px] font-[450] transition-colors hover:bg-white flex items-center justify-center"
            >
              Book a demo
            </Link>
            <Link
              href="/login"
              className="w-full h-[50px] rounded-[12px] border border-white/30 text-white text-[15px] font-[450] transition-colors hover:bg-white/5 flex items-center justify-center"
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
