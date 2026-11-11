/** CellarOS mark. Drawn in `currentColor`. The chosen design is LOGO; the others stay until we decide (see /logo-options.html). */
const MARKS = {
  /* A · Bottle end: the glass bottle end seen through the door, as on the cellar map */
  a: <>
    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" />
    <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
    <circle cx="50" cy="50" r="12" fill="currentColor" />
    <path d="M27,36 A26,26 0 0 1 40,24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
  </>,
  /* B · Cellar door: an arched cabinet with racks, one bottle lit */
  b: <>
    <path d="M22,90 V44 A28,28 0 0 1 78,44 V90 Z" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
    <line x1="25" y1="62" x2="75" y2="62" stroke="currentColor" strokeWidth="3" opacity="0.6" />
    <line x1="25" y1="78" x2="75" y2="78" stroke="currentColor" strokeWidth="3" opacity="0.6" />
    <circle cx="50" cy="44" r="9" fill="currentColor" />
  </>,
  /* C · Stacked bottles: three bottle ends, the top one found */
  c: <>
    <circle cx="31" cy="64" r="18" fill="none" stroke="currentColor" strokeWidth="5" />
    <circle cx="69" cy="64" r="18" fill="none" stroke="currentColor" strokeWidth="5" />
    <circle cx="50" cy="32" r="18" fill="currentColor" />
    <circle cx="50" cy="32" r="6" fill="#000" opacity="0.55" />
  </>,
  /* D · Glass and spark: wine plus the AI sommeliers */
  d: <>
    <path d="M30,14 H70 L71,34 A21,21 0 0 1 29,34 Z" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
    <path d="M31,34 A19,19 0 0 0 69,34 Z" fill="currentColor" opacity="0.9" />
    <line x1="50" y1="56" x2="50" y2="84" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <line x1="34" y1="88" x2="66" y2="88" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <path d="M82,10 l3,8 8,3 -8,3 -3,8 -3,-8 -8,-3 8,-3 z" fill="currentColor" />
  </>,
}
const LOGO: keyof typeof MARKS = 'a'

export default function Logo({ size = 96, className }: { size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">{MARKS[LOGO]}</svg>
}
