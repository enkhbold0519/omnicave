import { memo } from 'react';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import type { WineStyle } from '@/data/types';
import { wineStyleTints } from '@/theme/tokens';

/** Blend a #rrggbb color toward white (t > 0) or black (t < 0). */
function shade(hex: string, t: number): string {
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + target * k);
  return `#${[1, 3, 5].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The base of a bottle seen end-on through the cabinet glass: tinted glass that darkens toward the rim,
 * a concave punt with a lit edge, and a soft specular highlight from the cabinet light above.
 * Gradient IDs depend only on the style, so identical definitions can safely share an ID on web.
 */
export const BottleEnd = memo(function BottleEnd({ style, size }: { style: WineStyle; size: number }) {
  const tint = wineStyleTints[style];
  const r = size / 2;
  const key = style === 'Rosé' ? 'Rose' : style;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id={`glass-${key}`} cx="42%" cy="38%" r="62%">
          <Stop offset="0" stopColor={shade(tint, 0.28)} />
          <Stop offset="0.55" stopColor={tint} />
          <Stop offset="1" stopColor={shade(tint, -0.6)} />
        </RadialGradient>
        <RadialGradient id={`punt-${key}`} cx="50%" cy="56%" r="55%">
          <Stop offset="0" stopColor={shade(tint, -0.55)} />
          <Stop offset="0.75" stopColor={shade(tint, -0.3)} />
          <Stop offset="1" stopColor={shade(tint, 0.25)} />
        </RadialGradient>
        <RadialGradient id="specular" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.75} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 0.5} fill={`url(#glass-${key})`} stroke="rgba(0,0,0,0.55)" strokeWidth={1} />
      <Circle cx={r} cy={r} r={r * 0.5} fill={`url(#punt-${key})`} stroke="rgba(255,255,255,0.22)" strokeWidth={0.75} />
      <Ellipse
        cx={r * 0.66}
        cy={r * 0.58}
        rx={r * 0.34}
        ry={r * 0.18}
        fill="url(#specular)"
        transform={`rotate(-35 ${r * 0.66} ${r * 0.58})`}
      />
    </Svg>
  );
});

/** An empty position: a shadowed recess in the rack, darker at the top where the shelf above casts shade. */
export const EmptyRecess = memo(function EmptyRecess({ size }: { size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="recess" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.05} />
        </LinearGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill="url(#recess)" stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
    </Svg>
  );
});
