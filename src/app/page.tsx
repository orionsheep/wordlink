'use client';

import dynamic from 'next/dynamic';
import { useDeviceType, useOrientation } from '@/lib/hooks/useMediaQuery';
import { useSettings } from '@/context/SettingsContext';
import { useForceMobileLayout } from '@/lib/hooks';

// Code-split: only load the layout needed for the current device
const ThreeColumnLayout = dynamic(() => import('@/components/ThreeColumnLayout'), {
  loading: () => <div className="min-h-screen bg-black" />,
});
const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), {
  loading: () => <div className="h-[100dvh] bg-black" />,
});
const MobileWordList = dynamic(() => import('@/components/mobile/MobileWordList'), {
  loading: () => <div className="h-[100dvh] bg-black" />,
});

export default function Home() {
  const deviceType = useDeviceType();
  const orientation = useOrientation();
  const { layoutMode } = useSettings();
  const forceMobileLayout = useForceMobileLayout();

  // 优先级1：移动/平板设备在全屏模式 → 强制使用移动布局
  if (forceMobileLayout) {
    return (
      <MobileLayout>
        <MobileWordList />
      </MobileLayout>
    );
  }

  // 优先级2：竖屏且非桌面设备 → 使用移动布局
  if (orientation === 'portrait' && deviceType !== 'desktop') {
    return (
      <MobileLayout>
        <MobileWordList />
      </MobileLayout>
    );
  }

  // 优先级3：桌面或平板横屏（且设置为桌面模式）→ 三栏布局
  if (deviceType === 'desktop' || (deviceType === 'tablet' && layoutMode === 'desktop')) {
    return (
      <main className="min-h-screen">
        <ThreeColumnLayout />
      </main>
    );
  }

  // 其他情况 → 移动布局
  return (
    <MobileLayout>
      <MobileWordList />
    </MobileLayout>
  );
}
