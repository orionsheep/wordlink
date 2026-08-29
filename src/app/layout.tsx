import type { Metadata, Viewport } from "next";
// Temporarily disabled due to Next.js 16 + Turbopack font loading issue
// import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: "Lexiverse 语宙",
  description: "Lexiverse 语宙 - AI 语境认知阅读引擎：下一篇文章，就是你的复习",
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lexiverse 语宙',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#000000',
  viewportFit: 'cover', // iOS全屏适配，覆盖刘海屏等
};

import { SettingsProvider } from "@/context/SettingsContext";
import { ModuleConfigProvider } from "@/context/ModuleConfigContext";
import { AIProvider } from "@/components/ai";
import { AIComponents } from "@/components/ClientProviders";
import BackToHome from "@/components/BackToHome";
import AppChrome from "@/components/AppChrome";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://db.onlinewebfonts.com/c/13ab13418f633c1b0516fed6e30bedbc?family=Suisse+Int%27l"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('error', function(e) {
                if (e.message && (e.message.indexOf('Failed to load chunk') !== -1 || e.message.indexOf('ChunkLoadError') !== -1)) {
                  if (!sessionStorage.getItem('chunk_retry')) {
                    sessionStorage.setItem('chunk_retry', '1');
                    window.location.reload();
                  }
                }
              });
            `,
          }}
        />
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SettingsProvider>
            <ModuleConfigProvider>
              <AIProvider>
                <AppChrome>{children}</AppChrome>
                <AIComponents />
              </AIProvider>
            </ModuleConfigProvider>
          </SettingsProvider>
        </NextIntlClientProvider>
        <BackToHome />
      </body>
    </html>
  );
}
