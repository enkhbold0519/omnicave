import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { defaultPalette, palettes, type Colors, type PaletteId } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

interface ThemeValue {
  colors: Colors;
  scheme: Scheme;
  /** Light/dark/system mode. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Color family; each has a light and a dark version. */
  palette: PaletteId;
  setPalette: (p: PaletteId) => void;
}

const MODE_KEY = 'cellaros.themePreference';
const PALETTE_KEY = 'cellaros.palette';
const ThemeContext = createContext<ThemeValue | null>(null);

const isPreference = (v: unknown): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark';
const isPalette = (v: unknown): v is PaletteId => typeof v === 'string' && v in palettes;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [palette, setPaletteState] = useState<PaletteId>(defaultPalette);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([MODE_KEY, PALETTE_KEY])
      .then(([[, mode], [, pal]]) => {
        if (isPreference(mode)) setPreferenceState(mode);
        if (isPalette(pal)) setPaletteState(pal);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const colors = palettes[palette][scheme];

  useEffect(() => {
    // Native surfaces (modals, alerts, keyboards, the window behind screens) follow the same choice.
    // react-native-web's Appearance has no setColorScheme; there our palette alone carries the theme.
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    }
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [preference, colors.background]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(MODE_KEY, p).catch(() => {});
  }, []);

  const setPalette = useCallback((p: PaletteId) => {
    setPaletteState(p);
    AsyncStorage.setItem(PALETTE_KEY, p).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ colors, scheme, preference, setPreference, palette, setPalette }),
    [colors, scheme, preference, setPreference, palette, setPalette],
  );

  // Hold the first frame until the saved choices are known, so the app never flashes the wrong theme.
  if (!loaded) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/**
 * Builds a hook that returns styles for the active palette, recomputed only when the theme changes.
 * Usage: `const useStyles = makeStyles((c) => StyleSheet.create({ ... }))`.
 */
export function makeStyles<T>(factory: (colors: Colors) => T): () => T {
  return function useStyles() {
    const { colors } = useTheme();
    return useMemo(() => factory(colors), [colors]);
  };
}
