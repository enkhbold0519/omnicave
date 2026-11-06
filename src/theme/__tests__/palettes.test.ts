import { describe, expect, it } from '@jest/globals';

import { cabinet, palettes, type Colors } from '../tokens';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Key = keyof Colors;
const surfaces: Key[] = ['background', 'surface', 'surfaceMuted'];
const texts: Key[] = ['textPrimary', 'textSecondary', 'textMuted', 'accent', 'success', 'warning', 'danger'];

const cases = Object.entries(palettes).flatMap(([id, p]) =>
  (['light', 'dark'] as const).map((mode) => [`${id} ${mode}`, p[mode]] as const),
);

describe.each(cases)('%s palette', (_name, c) => {
  it('keeps every text color at ≥4.5:1 on every surface, including pressed', () => {
    for (const bg of surfaces) {
      for (const fg of texts) {
        expect({ pair: `${fg} on ${bg}`, ok: contrast(c[fg], c[bg]) >= 4.5 }).toEqual({ pair: `${fg} on ${bg}`, ok: true });
      }
    }
  });

  it('keeps text readable on accent buttons and status banners', () => {
    expect(contrast(c.textOnAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textOnAccent, c.accentPressed)).toBeGreaterThanOrEqual(4.5);
    for (const bg of ['warningSoft', 'dangerSoft'] as Key[]) {
      for (const fg of ['textSecondary', 'warning', 'danger'] as Key[]) {
        expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the text hierarchy distinct: primary > secondary > muted', () => {
    const p = contrast(c.textPrimary, c.surface);
    const s = contrast(c.textSecondary, c.surface);
    const m = contrast(c.textMuted, c.surface);
    expect(p).toBeGreaterThan(s * 1.25);
    expect(s).toBeGreaterThan(m * 1.25);
  });
});

describe('glass cabinet', () => {
  it('keeps its labels readable on the dark interior and frame', () => {
    for (const bg of [cabinet.interior, cabinet.frame]) {
      expect(contrast(cabinet.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(cabinet.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(cabinet.caution, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
