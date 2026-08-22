'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Globe, Mail, Youtube } from 'lucide-react';
import { MEDIA } from '@/lib/welcome-media';

/** 用 requestAnimationFrame 在指定时长内平滑过渡元素 opacity。 */
function fadeOpacity(el: HTMLElement, to: number, duration: number) {
  const from = Number(getComputedStyle(el).opacity) || 0;
  const start = performance.now();

  function tick(now: number) {
    const t = Math.min((now - start) / duration, 1);
    el.style.opacity = String(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const NAV_LINKS = [
  { label: '功能', href: '#features' },
  { label: '方法', href: '#how' },
  { label: '关于', href: '#about' },
];

interface SessionUser {
  id?: string;
  email?: string;
  name?: string;
}

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const hasVideo = MEDIA.heroBackgroundVideo !== '';

  // 登录态感知:复用站内 /api/auth/me 会话
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

  // 背景视频淡入淡出无缝循环:canplay 时淡入,临近结尾淡出,
  // ended 后重置进度重新播放并再次淡入(因此视频不要加 loop 属性)。
  useEffect(() => {
    if (!hasVideo) return;
    const video = videoRef.current;
    if (!video) return;

    let fadingOut = false;

    const onCanPlay = () => {
      video.play().catch(() => {});
      fadingOut = false;
      fadeOpacity(video, 1, 500);
    };

    const onTimeUpdate = () => {
      const remaining = video.duration - video.currentTime;
      if (remaining <= 0.55 && !fadingOut) {
        fadingOut = true;
        fadeOpacity(video, 0, 500);
      }
    };

    const onEnded = () => {
      video.style.opacity = '0';
      setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(() => {});
        fadeOpacity(video, 1, 500);
        fadingOut = false;
      }, 100);
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [hasVideo]);

  // 进入应用:写入 wl_welcome_seen,与旧版行为一致
  const enterApp = useCallback(() => {
    document.cookie = 'wl_welcome_seen=1; path=/; max-age=31536000; samesite=lax';
  }, []);

  // 未登录时路由守卫会把非认证页弹回 welcome,
  // 因此所有出口在未登录时直接指向 /login,避免死循环
  const loggedIn = authChecked && !!user;
  const ctaHref = loggedIn ? '/study' : '/login';
  const ctaLabel = loggedIn ? '继续学习' : '开始学习';

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    setEmail('');
  };

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-black">
      {/* 全屏背景视频(素材位:heroBackgroundVideo) */}
      {hasVideo ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover object-bottom"
          style={{ opacity: 0 }}
          src={MEDIA.heroBackgroundVideo}
          muted
          autoPlay
          playsInline
          preload="auto"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(255,255,255,0.06)_0%,_transparent_60%)]" />
      )}

      {/* ===== Navbar ===== */}
      <nav className="relative z-20 px-6 py-6">
        <div className="liquid-glass mx-auto flex max-w-5xl items-center justify-between rounded-full px-6 py-3">
          <div className="flex items-center">
            <Link
              href={ctaHref}
              onClick={enterApp}
              className="font-serif-display text-lg font-semibold text-white"
            >
              WordLink
            </Link>
            <div className="ml-8 hidden items-center gap-8 md:flex">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {loggedIn ? (
              <span className="hidden text-sm text-white/60 sm:block">
                你好,{user?.name || user?.email?.split('@')[0]}
              </span>
            ) : (
              <Link
                href="/login"
                onClick={enterApp}
                className="hidden text-sm font-medium text-white transition-colors hover:text-white/80 sm:block"
              >
                登录
              </Link>
            )}
            <Link
              href={ctaHref}
              onClick={enterApp}
              className="liquid-glass rounded-full px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              {ctaLabel}
            </Link>
          </div>
        </div>
      </nav>

      {/* ===== 主内容 ===== */}
      <div className="relative z-10 flex flex-1 -translate-y-[20%] flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="font-serif-display whitespace-nowrap text-5xl tracking-tight text-white sm:text-7xl md:text-8xl lg:text-9xl">
          一词,连成<em className="italic">星图</em>
        </h1>

        <form onSubmit={handleSubscribe} className="mt-10 w-full max-w-xl">
          <div className="liquid-glass flex items-center gap-3 rounded-full py-2 pl-6 pr-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="输入邮箱,加入早鸟名单"
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
            />
            <button
              type="submit"
              aria-label="订阅"
              className="shrink-0 rounded-full bg-white p-3 text-black transition-colors hover:bg-white/90"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </form>

        <p className="mt-6 max-w-xl px-4 text-sm leading-relaxed text-white">
          以语境、联想与科学的记忆节奏,把每一个生词,变成如母语般自然的直觉。
        </p>

        <a
          href="#about"
          className="liquid-glass mt-10 rounded-full px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5"
        >
          产品理念
        </a>
      </div>

      {/* ===== 社交图标 ===== */}
      <div className="relative z-10 flex justify-center gap-4 pb-12">
        {[
          { icon: Youtube, label: 'YouTube' },
          { icon: Globe, label: 'Website' },
          { icon: Mail, label: 'Email' },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            aria-label={label}
            className="liquid-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white"
          >
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </section>
  );
}
