import { useEffect, useMemo, useState, type MouseEvent as RME, type PointerEvent as RPE } from 'react'
import { usePoll, useClock } from '../hooks'
import type { Bottle, Cellar, EnvZone } from '../types'
import { isNight, nextSaverStyle } from '../saver'
import FeaturedBottle from './FeaturedBottle'
import CellarView from './CellarView'
import { zoneLabel, zoneState } from './CellarStatus'

interface Brief { news: { title: string; source: string }[] }
interface Windows { ready: Bottle[]; approaching: Bottle[]; past_peak: Bottle[] }
interface Line { kind: string; text: string }

const NO_HL = new Set<number>()
const noop = () => {}

/**
 * Always-on display for the transparent door. Black is see-through, so the real bottles show through the glass
 * and only a few things are lit: the clock, the cellar turning slowly, and headlines fading in one by one.
 * Alerts stay on. Everything shifts a few pixels each minute so the OLED doesn't burn in.
 */
export default function ScreenSaver({ cellar, zones, onWake }: { cellar: Cellar | null; zones?: EnvZone[]; onWake: () => void }) {
  const now = useClock()
  const night = isNight(now)
  const { data: brief } = usePoll<Brief>('/api/briefing', 15 * 60_000)
  const { data: win } = usePoll<Windows>('/api/recommendations/windows', 15 * 60_000)
  const [i, setI] = useState(0)
  const [shift, setShift] = useState({ x: 0, y: 0 })
  const [style] = useState(nextSaverStyle)   // chosen once each time the saver starts

  const alerts = (zones ?? []).flatMap(z => {
    const st = zoneState(z)
    return st === 'alert' ? [`${zoneLabel(z.name)} is outside its range — ${z.latest!.temp.toFixed(1)} °C · ${Math.round(z.latest!.hum)} %`]
      : st === 'offline' ? [`${zoneLabel(z.name)}: sensor offline`] : []
  })

  const lines: Line[] = useMemo(() => {
    const out: Line[] = []
    if (win) {
      const n = win.ready.length
      out.push({ kind: 'Your cellar', text: n ? `${n} ${n === 1 ? 'bottle is' : 'bottles are'} ready to drink` : 'Nothing is at its peak yet' })
      const soon = [...win.past_peak, ...win.ready][0]
      if (soon) out.push({ kind: 'Open soon', text: `${soon.wine.name} ${soon.wine.vintage || 'NV'}` })
    }
    for (const z of zones ?? []) if (z.latest) out.push({ kind: zoneLabel(z.name), text: `${z.latest.temp.toFixed(1)} °C · ${Math.round(z.latest.hum)} %` })
    for (const n of (brief?.news ?? []).slice(0, 5)) out.push({ kind: n.source, text: n.title })
    return out
  }, [win, brief, zones])

  // one headline every 8 s; the whole layout drifts a little every minute (OLED burn-in)
  useEffect(() => { const t = setInterval(() => setI(x => x + 1), 8000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const t = setInterval(() => setShift({ x: Math.round(Math.random() * 24 - 12), y: Math.round(Math.random() * 24 - 12) }), 60_000)
    return () => clearInterval(t)
  }, [])

  const line = lines.length ? lines[i % lines.length] : null
  // the whole tap belongs to the saver: it only wakes the screen and never presses what is underneath
  const swallow = (e: RPE) => { e.preventDefault(); e.stopPropagation() }
  const wake = (e: RME) => { e.preventDefault(); e.stopPropagation(); onWake() }

  return (
    <div className={`saver ${night ? 'night' : ''}`} onPointerDown={swallow} onClick={wake} role="button" aria-label="Tap to wake">
      <div className="saver-inner" style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
        <div className="saver-clock">
          <div className="saver-time">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
          <div className="saver-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>

        {!night && style === 'bottle' && <div className="saver-featured"><FeaturedBottle /></div>}
        {!night && style === 'cellar' && cellar && (
          <div className="saver-cellar">
            <CellarView cellar={cellar} mode="3d" width={900} height={900} selectedId={null} highlight={NO_HL} ghosts={[]}
                        onSelect={noop} placing={null} onPlace={noop} onGhost={noop} ambient />
          </div>
        )}

        <div className="saver-foot">
          {alerts.map(a => <div key={a} className="saver-alert"><i />{a}</div>)}
          {!night && style === 'cellar' && line && (
            <div key={i} className="saver-line">
              <span className="t-overline">{line.kind}</span>
              <span className="saver-text">{line.text}</span>
            </div>
          )}
          {!night && style === 'cellar' && lines.length > 1 && (
            <div className="saver-dots" aria-hidden="true">
              {lines.map((_, k) => <i key={k} className={k === i % lines.length ? 'on' : ''} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
