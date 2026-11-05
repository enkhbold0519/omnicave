/**
 * Shared design tokens for CellarOS.
 * Warm ivory surfaces, forest-green accents, champagne highlights, Montserrat type.
 */

export const colors = {
  background: '#F7F4EC',
  surface: '#FBF9F4',
  surfaceMuted: '#EFEADD',
  border: '#E3DDCF',

  textPrimary: '#1F2A24',
  textSecondary: '#5C6660',
  textMuted: '#7D847F',
  textOnAccent: '#FFFFFF',

  accent: '#24493A',
  accentPressed: '#1A372B',
  accentSoft: '#E4ECE6',

  champagne: '#E9E1CE',
  champagneStrong: '#B89B5E',

  success: '#2F6B4F',
  warning: '#9A6413',
  warningSoft: '#F6EBD7',
  danger: '#A23B32',
  dangerSoft: '#F6E2DF',

  badge: '#B23A2E',
  scrim: 'rgba(20, 26, 22, 0.42)',
} as const;

export const fonts = {
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semiBold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** Minimum touch target (Material guidance: 48dp). */
export const touchTarget = 48;

/** Horizontal page gutter; kept modest so small Android screens keep usable width. */
export const gutter = spacing.xl;

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'overline';

export const typography: Record<
  TextVariant,
  { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number }
> = {
  display: { fontFamily: fonts.medium, fontSize: 28, lineHeight: 36 },
  title: { fontFamily: fonts.semiBold, fontSize: 20, lineHeight: 28 },
  heading: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 16, letterSpacing: 0.8 },
};

/** Ideal storage ranges used to classify cellar conditions. */
export const idealRanges = {
  temperatureC: { min: 10, max: 15 },
  humidityPct: { min: 55, max: 75 },
} as const;

/** Readings older than this are treated as stale rather than live. */
export const staleAfterMinutes = 15;
