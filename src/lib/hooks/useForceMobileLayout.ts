'use client';

import { useSettings } from '@/context/SettingsContext';
import { useDeviceType, useMediaQuery } from './useMediaQuery';

const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i;

export function useForceMobileLayout(): boolean {
  const { isFullscreen } = useSettings();
  const deviceType = useDeviceType();
  const hasCoarsePointer = useMediaQuery('(pointer: coarse)');
  const hasNoHover = useMediaQuery('(hover: none)');

  const isMobileUserAgent = typeof navigator !== 'undefined' && MOBILE_UA_PATTERN.test(navigator.userAgent);
  const isMobileLikeDevice = deviceType !== 'desktop' || (hasCoarsePointer && hasNoHover) || isMobileUserAgent;

  return isFullscreen && isMobileLikeDevice;
}
