import type { Metadata } from 'next';
import AmbientScreen from '@/components/ambient/AmbientScreen';

export const metadata: Metadata = {
    title: 'Lexiverse Ambient — 语宙 · 沉浸听读空间',
    description:
        'A screensaver-grade immersive space: seasonal scenery, synthesized soundscapes and a gentle stream of words.',
};

export default function AmbientPage() {
    return <AmbientScreen />;
}
