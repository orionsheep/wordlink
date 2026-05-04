'use client';

import { useState, useEffect } from 'react';
import { BREAKPOINTS, ORIENTATION } from '@/lib/constants';

export { BREAKPOINTS };

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function useDeviceType(): DeviceType {
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);

  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}

export type Orientation = 'portrait' | 'landscape';

export function useOrientation(): Orientation {
  const isPortrait = useMediaQuery(ORIENTATION.portrait);
  return isPortrait ? 'portrait' : 'landscape';
}
