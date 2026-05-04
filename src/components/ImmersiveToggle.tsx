'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Monitor, LayoutDashboard } from 'lucide-react';

interface ImmersiveToggleProps {
    variant?: 'floating' | 'inline';
    currentWord?: string | null;
}

export default function ImmersiveToggle({ variant = 'floating', currentWord }: ImmersiveToggleProps) {
    const router = useRouter();
    const pathname = usePathname();
    const isImmersive = pathname === '/immersive';

    const toggleMode = () => {
        if (isImmersive) {
            // Set flag to trigger auto-refresh when returning to dashboard
            sessionStorage.setItem('autoRefreshGraph', 'true');
            router.push('/');
        } else {
            const url = currentWord ? `/immersive?word=${encodeURIComponent(currentWord)}` : '/immersive';
            router.push(url);
        }
    };

    if (variant === 'inline') {
        return (
            <button
                onClick={toggleMode}
                className="flex items-center gap-2 text-xs text-neutral-500 hover:text-purple-400 transition-colors group"
                title={isImmersive ? "Exit Immersive Mode" : "Enter Immersive Mode"}
            >
                <span>Immersive</span>
                {isImmersive ? (
                    <LayoutDashboard size={14} className="group-hover:text-purple-400" />
                ) : (
                    <Monitor size={14} className="group-hover:text-purple-400" />
                )}
            </button>
        );
    }

    return (
        <button
            onClick={toggleMode}
            className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-blue-500/50 transition-all duration-300 group"
            title={isImmersive ? "Exit Immersive Mode" : "Enter Immersive Mode"}
        >
            {isImmersive ? (
                <LayoutDashboard size={24} />
            ) : (
                <Monitor size={24} />
            )}
            <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {isImmersive ? "Back to Dashboard" : "Immersive Mode"}
            </span>
        </button>
    );
}
