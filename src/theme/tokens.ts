/**
 * Shared design tokens for CellarOS.
 * Quiet luxury: warm light surfaces (or deep night ones), hairline structure, one accent used sparingly
 * for meaning, Montserrat with weight contrast (Light for display, Medium for emphasis).
 * Colors are read through `useTheme()`; everything else here is theme-independent.
 */

export interface Colors {
  background: string;
  surface: string;
  surfaceMuted: string;
  hairline: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  success: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  scrim: string;
}

type Mode = 'light' | 'dark';
type PaletteColors = Omit<Colors, 'success' | 'warning' | 'warningSoft' | 'danger' | 'dangerSoft' | 'scrim'>;

/**
 * Status colors stay the same across palettes so "warning" and "offline" always look the same.
 * Every palette × mode pair is checked for ≥4.5:1 text contrast (muted text on pressed surfaces included).
 */
const status: Record<Mode, Pick<Colors, 'success' | 'warning' | 'warningSoft' | 'danger' | 'dangerSoft' | 'scrim'>> = {
  light: {
    success: '#3D6B52',
    warning: '#7D550F',
    warningSoft: '#F7EFDD',
    danger: '#9C3B33',
    dangerSoft: '#F7E6E3',
    scrim: 'rgba(20, 24, 22, 0.32)',
  },
  dark: {
    success: '#83B79A',
    warning: '#D9AA5E',
    warningSoft: '#2A2418',
    danger: '#E38E84',
    dangerSoft: '#2D1D1B',
    scrim: 'rgba(0, 0, 0, 0.55)',
  },
};

export type PaletteId = 'forest' | 'bordeaux' | 'oak' | 'slate';

export interface Palette {
  name: string;
  description: string;
  light: Colors;
  dark: Colors;
}

function palette(name: string, description: string, light: PaletteColors, dark: PaletteColors): Palette {
  return { name, description, light: { ...light, ...status.light }, dark: { ...dark, ...status.dark } };
}

export const palettes: Record<PaletteId, Palette> = {
  forest: palette(
    'Forest',
    'Ivory and cellar green',
    {
      background: '#F6F3EC',
      surface: '#FBFAF6',
      surfaceMuted: '#EFEBE1',
      hairline: '#E2DDD1',
      textPrimary: '#1C2420',
      textSecondary: '#474F4A',
      textMuted: '#636863',
      textOnAccent: '#FBFAF6',
      accent: '#23443A',
      accentPressed: '#1A332B',
      accentSoft: '#E7EDE8',
    },
    {
      background: '#111513',
      surface: '#181D1A',
      surfaceMuted: '#212723',
      hairline: '#2A312D',
      textPrimary: '#ECE7DC',
      textSecondary: '#C9CBC4',
      textMuted: '#A3A79F',
      textOnAccent: '#111513',
      accent: '#9DC2AD',
      accentPressed: '#86AD97',
      accentSoft: '#1E2A24',
    },
  ),
  bordeaux: palette(
    'Bordeaux',
    'Blush ivory and deep wine',
    {
      background: '#F7F2EE',
      surface: '#FCF9F6',
      surfaceMuted: '#F0E8E2',
      hairline: '#E6DBD3',
      textPrimary: '#241A1C',
      textSecondary: '#524649',
      textMuted: '#6D6366',
      textOnAccent: '#FCF9F6',
      accent: '#6E2433',
      accentPressed: '#561B28',
      accentSoft: '#F1E3E5',
    },
    {
      background: '#151112',
      surface: '#1D1719',
      surfaceMuted: '#272023',
      hairline: '#33292C',
      textPrimary: '#EFE6E2',
      textSecondary: '#CDC3C1',
      textMuted: '#A99D9C',
      textOnAccent: '#151112',
      accent: '#E0A3AE',
      accentPressed: '#CC8C98',
      accentSoft: '#2C1D21',
    },
  ),
  oak: palette(
    'Oak',
    'Parchment and tobacco brown',
    {
      background: '#F6F1E8',
      surface: '#FBF8F2',
      surfaceMuted: '#EEE6D8',
      hairline: '#E2D8C6',
      textPrimary: '#231D16',
      textSecondary: '#504637',
      textMuted: '#6A6154',
      textOnAccent: '#FBF8F2',
      accent: '#6F4A20',
      accentPressed: '#583A18',
      accentSoft: '#F1E7D8',
    },
    {
      background: '#14110D',
      surface: '#1C1813',
      surfaceMuted: '#26211A',
      hairline: '#322B22',
      textPrimary: '#EEE6D8',
      textSecondary: '#CCC3B5',
      textMuted: '#A69C8E',
      textOnAccent: '#14110D',
      accent: '#D9B07A',
      accentPressed: '#C49A64',
      accentSoft: '#2B2319',
    },
  ),
  slate: palette(
    'Slate',
    'Stone grey and ink blue',
    {
      background: '#F3F4F2',
      surface: '#FAFAF9',
      surfaceMuted: '#E9EBE8',
      hairline: '#DCDFDB',
      textPrimary: '#1A1F24',
      textSecondary: '#454E56',
      textMuted: '#60676E',
      textOnAccent: '#FAFAF9',
      accent: '#2D4356',
      accentPressed: '#223444',
      accentSoft: '#E3E9EE',
    },
    {
      background: '#101317',
      surface: '#171B20',
      surfaceMuted: '#20252B',
      hairline: '#2A3037',
      textPrimary: '#E6E9EC',
      textSecondary: '#C3C8CD',
      textMuted: '#9CA3AA',
      textOnAccent: '#101317',
      accent: '#A6BED3',
      accentPressed: '#8FA9C0',
      accentSoft: '#1C252E',
    },
  ),
};

export const defaultPalette: PaletteId = 'forest';

export const fonts = {
  light: 'Montserrat_300Light',
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semiBold: 'Montserrat_600SemiBold',
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

/** Crisp corners: nothing larger than 12 on cards; pills only for tiny indicators. */
export const radii = {
  sm: 6,
  md: 10,
  lg: 12,
  pill: 999,
} as const;

/** Minimum touch target (Material guidance: 48dp). */
export const touchTarget = 48;

/** Horizontal page gutter. */
export const gutter = 24;

export type TextVariant =
  | 'hero'
  | 'display'
  | 'headline'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'overline';

/** Tracking is size-specific: negative on large text, slightly positive on small text. */
export const typography: Record<
  TextVariant,
  { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }
> = {
  hero: { fontFamily: fonts.light, fontSize: 44, lineHeight: 50, letterSpacing: -1.4 },
  display: { fontFamily: fonts.light, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  headline: { fontFamily: fonts.light, fontSize: 23, lineHeight: 29, letterSpacing: -0.4 },
  title: { fontFamily: fonts.regular, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, letterSpacing: 0 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: 0.1 },
  overline: { fontFamily: fonts.medium, fontSize: 10.5, lineHeight: 14, letterSpacing: 1.6 },
};

/** Press feedback timing (emil-design-eng / animate-expo): quick in, slightly slower out. */
/** Muted swatches that mark a wine's style as a quiet accent (dots, thin bars), never a color block. */
export const wineStyleTints = {
  Red: '#7A3340',
  White: '#C7B57A',
  Rosé: '#CE998F',
  Sparkling: '#B4A57A',
  Dessert: '#B98A3E',
} as const;

/**
 * The Cellar Map's glass cabinet. Deliberately theme-independent: like a real smoked-glass door, it stays dark
 * in light mode too, so the bottles read clearly. Text colors are checked for ≥4.5:1 on `interior`.
 */
export const cabinet = {
  frame: '#1B1D1F',
  frameEdge: '#3A3E42',
  interior: '#0D0F10',
  rail: '#26292B',
  railEdge: 'rgba(255, 255, 255, 0.16)',
  text: '#D8D2C6',
  textMuted: '#9A958B',
  /** Warm "interior light" used for the selection ring and the found-bottle pulse. */
  glow: '#E9D8B0',
  /** Uncertain sensor-detected positions and out-of-target readings. */
  caution: '#E3B25C',
  ledGlow: 'rgba(255, 238, 205, 0.20)',
  /** Faint per-zone temperature washes: cool for sparkling, neutral for white, warm for red. */
  zoneTints: {
    sparkling: 'rgba(130, 170, 215, 0.10)',
    white: 'rgba(225, 215, 175, 0.06)',
    red: 'rgba(200, 115, 85, 0.09)',
  },
} as const;

export const motion = {
  pressInMs: 100,
  pressOutMs: 160,
  /** Strong ease-out control points. */
  easeOut: [0.23, 1, 0.32, 1] as const,
};

/** Ideal storage ranges used to classify cellar conditions. */
export const idealRanges = {
  temperatureC: { min: 10, max: 15 },
  humidityPct: { min: 55, max: 75 },
} as const;

/** Readings older than this are treated as stale rather than live. */
export const staleAfterMinutes = 15;
