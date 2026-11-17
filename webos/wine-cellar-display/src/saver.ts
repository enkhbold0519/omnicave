import { safeGet, safeSet } from './api'

/** Screen saver settings (kept on this display). */
export const SAVER_AFTER = [[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [0, 'Off']] as const
export type SaverAfter = (typeof SAVER_AFTER)[number][0]
export const NIGHT_FROM = 23, NIGHT_TO = 7

export const SAVER_STYLES = [['cellar', '3D cellar', 'Your cellar builds itself and turns'], ['bottle', 'Featured bottle', 'One wine at a time, with a sommelier’s note'],
  ['alternate', 'Alternate', 'Switch style each time']] as const
export type SaverStyle = (typeof SAVER_STYLES)[number][0]
interface SaverCfg { after: SaverAfter; night: boolean; style: SaverStyle; turn: number }
const DEFAULTS: SaverCfg = { after: 2, night: true, style: 'cellar', turn: 0 }

const KEY = 'wc.saver'
export function getSaver(): SaverCfg {
  try { return { ...DEFAULTS, ...JSON.parse(safeGet(KEY) ?? '{}') } } catch { return DEFAULTS }
}
export function setSaver(v: Partial<SaverCfg>) { safeSet(KEY, JSON.stringify({ ...getSaver(), ...v })) }

/** Which style to show now. "Alternate" flips every time the saver starts. Developer shortcut: ?style=bottle */
export function nextSaverStyle(): 'cellar' | 'bottle' {
  const dev = params().get('style')
  if (dev === 'cellar' || dev === 'bottle') return dev
  const c = getSaver()
  if (c.style !== 'alternate') return c.style
  setSaver({ turn: c.turn + 1 })
  return c.turn % 2 ? 'bottle' : 'cellar'
}

const params = () => new URLSearchParams(location.search)

/** Idle time before the saver starts. Developer shortcut: ?saver=10 → 10 seconds. */
export function saverTimeoutMs(): number {
  const dev = Number(params().get('saver'))
  if (dev > 0) return dev * 1000
  return getSaver().after * 60_000
}

/** Night mode: clock and alerts only. Developer shortcut: ?night=1 forces it on. */
export function isNight(now: Date): boolean {
  if (params().get('night') === '1') return true
  if (!getSaver().night) return false
  const h = now.getHours()
  return h >= NIGHT_FROM || h < NIGHT_TO
}
