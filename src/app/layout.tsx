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
  title: "WordLink",
  description: "WordLink - 英语单词裂变与认知星图系统",
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'WordLink',
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SettingsProvider>
            <ModuleConfigProvider>
              <AIProvider>
                {children}
                <AIComponents />
              </AIProvider>
            </ModuleConfigProvider>
          </SettingsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
