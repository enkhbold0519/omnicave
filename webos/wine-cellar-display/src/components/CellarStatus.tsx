import { parseTs } from '../api'
import { useClock } from '../hooks'
import type { EnvZone, Reading } from '../types'

export type ZoneState = 'ok' | 'alert' | 'offline' | 'waiting'
export const zoneState = (z: EnvZone): ZoneState => !z.latest ? 'waiting' : !z.sensor_online ? 'offline' : z.in_range ? 'ok' : 'alert'
/** "Upper · Sparkling & White" → "Sparkling & White" (what is stored there means more than where). */
export const zoneLabel = (name: string) => name.split(' · ').pop() ?? name

const STATE_TEXT: Record<ZoneState, string> = { ok: 'Normal', alert: 'Outside range', offline: 'Sensor offline', waiting: 'Waiting for sensor' }

function greeting(now: Date) {
  const h = now.getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function ago(r: Reading | null, now: Date) {
  if (!r) return 'no reading yet'
  const min = Math.floor((now.getTime() - parseTs(r.ts).getTime()) / 60000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.floor(min / 60)} h ago` : `${Math.floor(min / 1440)} d ago`
}

/** Android Home: greeting plus one sentence on how the cellar is doing. */
export function Welcome({ name, zones, bottles, offline }: { name: string; zones?: EnvZone[]; bottles: number; offline: boolean }) {
  const now = useClock()
  const states = (zones ?? []).map(zoneState)
  const summary = !zones ? null
    : offline || states.includes('offline') ? 'Some sensors are offline. Readings may be out of date.'
    : states.includes('alert') ? 'Your cellar needs attention.'
    : bottles === 0 ? 'Your cellar is ready for its first bottle.'
    : 'Your collection is resting well.'
  return (
    <div className="welcome">
      <h1>{greeting(now)}, {name}.</h1>
      {summary && <p className="fg-2">{summary}</p>}
    </div>
  )
}

/** Android CellarStatusCard: bottle count on the left, one compact column per climate zone. */
export function StatusCard({ zones, bottles, onBottles, onZone }: {
  zones?: EnvZone[]; bottles: number; onBottles: () => void; onZone: (z: EnvZone) => void
}) {
  const now = useClock()
  return (
    <div className="status-card">
      <button className="sc-bottles" onClick={onBottles} aria-label={`${bottles} bottles. Opens your inventory.`}>
        <span className="t-hero">{bottles}</span>
        <span className="t-overline">{bottles === 1 ? 'Bottle' : 'Bottles'} →</span>
      </button>
      {(zones ?? []).map(z => {
        const st = zoneState(z)
        const l = z.latest
        return (
          <button key={z.id} className={`sc-zone ${st}`} onClick={() => onZone(z)}
                  aria-label={`${zoneLabel(z.name)}: ${l ? `${l.temp.toFixed(1)} degrees, ${Math.round(l.hum)} percent` : 'no reading'}. ${STATE_TEXT[st]}. Opens climate history.`}>
            <span className="t-overline">{zoneLabel(z.name)}</span>
            <span className="sc-values">
              <span className="t-headline">{l ? l.temp.toFixed(1) : '—'}<small>°C</small></span>
              <span className="t-headline">{l ? Math.round(l.hum) : '—'}<small>%</small></span>
            </span>
            <span className="sc-state"><i className="led" />{st === 'ok' ? `Normal · ${ago(l, now)}` : STATE_TEXT[st]}</span>
          </button>
        )
      })}
      {!zones && <div className="sc-zone muted">Loading sensors…</div>}
    </div>
  )
}
