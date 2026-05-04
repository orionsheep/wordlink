'use client';

import dynamic from 'next/dynamic';
import { useDeviceType } from '@/lib/hooks/useMediaQuery';
import { useForceMobileLayout } from '@/lib/hooks';
import SettingsContent from '@/components/SettingsContent';

const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false });

export default function SettingsPage() {
    const deviceType = useDeviceType();
    const forceMobileLayout = useForceMobileLayout();
    const isMobile = deviceType === 'mobile' || forceMobileLayout;

    const content = (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-2xl mx-auto">
                <div className="h-[calc(100vh-env(safe-area-inset-bottom)-3.5rem)]">
                    <SettingsContent />
                </div>
            </div>
        </div>
    );

    if (isMobile) {
        return <MobileLayout>{content}</MobileLayout>;
    }

    return content;
}
