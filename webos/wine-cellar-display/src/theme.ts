import { safeGet, safeSet } from './api'

/** Same palettes as the Android app (dark versions only: black is see-through on the OLED door). */
export const PALETTES = [
  { id: 'forest', name: 'Forest', description: 'Cellar green', swatch: '#9dc2ad' },
  { id: 'bordeaux', name: 'Bordeaux', description: 'Deep wine', swatch: '#e0a3ae' },
  { id: 'oak', name: 'Oak', description: 'Tobacco brown', swatch: '#d9b07a' },
  { id: 'slate', name: 'Slate', description: 'Ink blue', swatch: '#a6bed3' },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']

const KEY = 'wc.palette'

export function getPalette(): PaletteId {
  const saved = safeGet(KEY)
  return PALETTES.some(p => p.id === saved) ? (saved as PaletteId) : 'forest'
}

export function applyPalette(id: PaletteId = getPalette()) {
  document.documentElement.dataset.palette = id
  safeSet(KEY, id)
}
