export const BREAKPOINTS = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
} as const;

export const ORIENTATION = {
  portrait: '(orientation: portrait)',
  landscape: '(orientation: landscape)',
} as const;
