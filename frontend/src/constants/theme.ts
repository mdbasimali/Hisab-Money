// ─────────────────────────────────────────────────────────────────────────────
// App theme constants
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  primary: '#16a34a',       // green-600
  primaryDark: '#15803d',   // green-700
  primaryDarker: '#166534', // green-800
  primaryLight: '#dcfce7',  // green-100
  primaryLighter: '#f0fdf4',// green-50

  white: '#ffffff',
  background: '#f8faf9',
  surface: '#f8faf9',
  surfaceCard: '#ffffff',

  textPrimary: '#111827',   // gray-900
  textSecondary: '#6b7280', // gray-500
  textMuted: '#9ca3af',     // gray-400
  textOnPrimary: '#ffffff',

  border: '#e5e7eb',        // gray-200
  borderLight: '#f3f4f6',   // gray-100

  danger: '#ef4444',        // red-500
  dangerLight: '#fef2f2',   // red-50
  warning: '#f59e0b',       // amber-500
  warningLight: '#fffbeb',  // amber-50
  success: '#22c55e',       // green-500
  successLight: '#f0fdf4',  // green-50
  info: '#3b82f6',          // blue-500
  infoLight: '#eff6ff',     // blue-50

  // Special
  gold: '#d97706',          // amber-600
  shadow: 'rgba(0,0,0,0.08)',
} as const;

export const DARK_COLORS = {
  primary: '#22c55e',       // green-500
  primaryDark: '#16a34a',   // green-600
  primaryDarker: '#15803d', // green-700
  primaryLight: '#064e3b',  // green-900 / dark green tint
  primaryLighter: '#022c22',// very dark green

  white: '#111827',         // inverted card/element base
  background: '#090d16',    // dark slate background
  surface: '#0f172a',       // slate-900
  surfaceCard: '#1e293b',   // slate-800 card

  textPrimary: '#f9fafb',   // gray-50
  textSecondary: '#cbd5e1', // slate-300
  textMuted: '#94a3b8',     // slate-400
  textOnPrimary: '#ffffff',

  border: '#334155',        // slate-700
  borderLight: '#1e293b',   // slate-800

  danger: '#f87171',        // red-400
  dangerLight: '#450a0a',   // red-950
  warning: '#fbbf24',       // amber-400
  warningLight: '#451a03',  // amber-950
  success: '#4ade80',       // green-400
  successLight: '#052e16',  // green-950
  info: '#60a5fa',          // blue-400
  infoLight: '#172554',     // blue-950

  gold: '#fbbf24',
  shadow: 'rgba(0,0,0,0.5)',
} as const;

export type ColorTheme = typeof COLORS;

export const FONT_SIZES = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 34,
} as const;

export const FONT_WEIGHTS = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const SPACING = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;
