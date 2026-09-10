import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import AmbientScreen from '@/components/ambient/AmbientScreen';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('ambient');
    return {
        title: t('metaTitle'),
        description: t('metaDescription'),
    };
}

export default function AmbientPage() {
    return <AmbientScreen />;
}
