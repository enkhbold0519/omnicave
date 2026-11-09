import { LineChart } from './Charts'
import type { EnvZone } from '../types'

export default function EnvStrip({ zones, stale }: { zones: EnvZone[] | undefined; stale: boolean }) {
  if (!zones) return <div className="env-strip muted">Loading sensors…</div>
  return (
    <div className="env-strip">
      {zones.map(z => {
        const l = z.latest
        const status = !l ? 'waiting' : !z.sensor_online ? 'offline' : z.in_range ? 'ok' : 'alert'
        return (
          <div key={z.id} className={`env-card ${status}`}>
            <div className="env-top">
              <span className="env-name">{z.name}</span>
              <span className={`badge env-${status}`}>{{ waiting: 'Waiting for sensor', offline: 'Sensor offline', ok: 'Stable', alert: 'Out of range' }[status]}</span>
            </div>
            <div className="env-values">
              <div><span className="env-big">{l ? l.temp.toFixed(1) : '—'}</span><span className="env-unit">°C</span>
                <div className="muted small">target {z.target_temp}° · {z.temp_min}–{z.temp_max}</div></div>
              <div><span className="env-big">{l ? Math.round(l.hum) : '—'}</span><span className="env-unit">%</span>
                <div className="muted small">target {z.target_hum}% · {z.hum_min}–{z.hum_max}</div></div>
            </div>
            <LineChart values={z.history.map(h => h.temp)} width={430} height={56} band={[z.temp_min, z.temp_max]}
                       color={status === 'alert' ? 'var(--danger)' : 'var(--accent)'} />
            {stale && <div className="muted small">cached — last known values</div>}
          </div>
        )
      })}
    </div>
  )
}
