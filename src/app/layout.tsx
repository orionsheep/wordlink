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
  title: "LPT英语俱乐部",
  description: "LPT English Club",
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LPT英语',
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SettingsProvider>
            <AIProvider>
              {children}
              <AIComponents />
            </AIProvider>
          </SettingsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
