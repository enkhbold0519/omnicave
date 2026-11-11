import { useEffect, useState } from 'react'
import { cachedGet, parseTs } from '../api'
import type { EnvZone } from '../types'
import { LineChart } from './Charts'
import { Modal } from './ui'
import { zoneLabel, zoneState } from './CellarStatus'

const PERIODS = [[60, '1 hour'], [360, '6 hours'], [1440, '24 hours']] as const

/** Paper: environment history with a selectable time period. Opened by tapping a zone on the Cellar page. */
export default function ClimateHistory({ cellarId, zone, onClose }: { cellarId: number; zone: EnvZone; onClose: () => void }) {
  const [minutes, setMinutes] = useState<number>(60)
  const [z, setZ] = useState<EnvZone>(zone)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    cachedGet<{ zones: EnvZone[] }>(`/api/cellars/${cellarId}/environment?minutes=${minutes}`)
      .then(r => { const f = r.data.zones.find(x => x.id === zone.id); if (f) setZ(f) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [cellarId, zone.id, minutes])

  const h = z.history
  const time = (i: number) => h[i] ? parseTs(h[i].ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
  const labels: [string, string] | undefined = h.length > 1 ? [time(0), time(h.length - 1)] : undefined
  const temps = h.map(r => r.temp), hums = h.map(r => r.hum)
  const range = (v: number[], d: number, u: string) => v.length ? `${Math.min(...v).toFixed(d)}–${Math.max(...v).toFixed(d)} ${u}` : '—'
  const alert = zoneState(z) === 'alert'

  return (
    <Modal title={zoneLabel(z.name)} onClose={onClose}>
      <div className="climate">
        <div className="seg">
          {PERIODS.map(([m, l]) => <button key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>{l}</button>)}
        </div>

        <div className="climate-block">
          <div className="climate-head">
            <span className="t-overline">Temperature</span>
            <span className="muted small">Keep at {z.target_temp.toFixed(1)} °C · range {range(temps, 1, '°C')}</span>
          </div>
          <span className="t-display">{z.latest ? z.latest.temp.toFixed(1) : '—'}<small> °C</small></span>
          {h.length > 1
            ? <LineChart values={temps} width={890} height={200} band={[z.temp_min, z.temp_max]} labels={labels} color={alert ? 'var(--warn)' : 'var(--accent)'} />
            : <p className="muted">{loading ? 'Loading…' : 'Not enough readings yet.'}</p>}
        </div>

        <div className="climate-block">
          <div className="climate-head">
            <span className="t-overline">Humidity</span>
            <span className="muted small">Keep at {z.target_hum} % · range {range(hums, 0, '%')}</span>
          </div>
          <span className="t-display">{z.latest ? Math.round(z.latest.hum) : '—'}<small> %</small></span>
          {h.length > 1 && <LineChart values={hums} width={890} height={200} band={[z.hum_min, z.hum_max]} labels={labels} color={alert ? 'var(--warn)' : 'var(--accent)'} />}
        </div>

        <p className="muted small">The shaded band is your alert range. Change it in Profile → Climate & alerts.</p>
      </div>
    </Modal>
  )
}
