import { useEffect, useRef, useState } from 'react'
import { mutateOrQueue } from '../api'
import type { EnvZone } from '../types'
import { PageHead, Row, Stepper } from './SettingsUi'
import { zoneLabel } from './CellarStatus'

/** How far a zone may drift from its target before you are alerted. */
const LEVELS = { relaxed: { t: 4, h: 15, label: 'Relaxed' }, standard: { t: 2.5, h: 12, label: 'Standard' }, strict: { t: 1.5, h: 8, label: 'Strict' } } as const
type Level = keyof typeof LEVELS | 'custom'
const DELAYS = [5, 15, 30, 60]

type Vals = Pick<EnvZone, 'target_temp' | 'target_hum' | 'temp_min' | 'temp_max' | 'hum_min' | 'hum_max' | 'alert_minutes'>
const near = (a: number, b: number) => Math.abs(a - b) < 0.06
function levelOf(v: Vals): Level {
  for (const [k, l] of Object.entries(LEVELS) as [keyof typeof LEVELS, (typeof LEVELS)[keyof typeof LEVELS]][]) {
    if (near(v.temp_min, v.target_temp - l.t) && near(v.temp_max, v.target_temp + l.t) && near(v.hum_min, v.target_hum - l.h) && near(v.hum_max, v.target_hum + l.h)) return k
  }
  return 'custom'
}
const around = (v: Vals, l: keyof typeof LEVELS): Vals => ({
  ...v, temp_min: +(v.target_temp - LEVELS[l].t).toFixed(1), temp_max: +(v.target_temp + LEVELS[l].t).toFixed(1),
  hum_min: Math.max(20, v.target_hum - LEVELS[l].h), hum_max: Math.min(95, v.target_hum + LEVELS[l].h),
})

export default function ClimateSettings({ cellarName, zones, onBack, flash }: { cellarName?: string; zones?: EnvZone[]; onBack: () => void; flash: (m: string) => void }) {
  const [open, setOpen] = useState<number | null>(null)
  const z = zones?.find(x => x.id === open)
  if (z) return <ZonePage z={z} onBack={() => setOpen(null)} flash={flash} />
  return (
    <div className="view settings">
      <PageHead title="Climate & alerts" onBack={onBack} />
      <p className="muted">{cellarName ? `${cellarName}. ` : ''}You get a notification when a zone stays outside its range.</p>
      <div className="rows">
        {zones?.map(x => {
          const lv = levelOf(x)
          return <Row key={x.id} label={zoneLabel(x.name)} value={`Keep at ${x.target_temp.toFixed(1)} °C · ${x.target_hum} % · ${lv === 'custom' ? 'Custom' : LEVELS[lv].label}`} onClick={() => setOpen(x.id)} />
        })}
      </div>
    </div>
  )
}

/** One zone: two targets, how strict the alerts are, how long before alerting. Saves as you change it. */
function ZonePage({ z, onBack, flash }: { z: EnvZone; onBack: () => void; flash: (m: string) => void }) {
  const [v, setV] = useState<Vals>({ target_temp: z.target_temp, target_hum: z.target_hum, temp_min: z.temp_min, temp_max: z.temp_max, hum_min: z.hum_min, hum_max: z.hum_max, alert_minutes: z.alert_minutes })
  const [level, setLevel] = useState<Level>(() => levelOf(v))
  const timer = useRef<number | null>(null)
  const first = useRef(true)

  // auto-save: a short pause after the last change, queued if offline
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try { const r = await mutateOrQueue('PATCH', `/api/zones/${z.id}`, v, `${zoneLabel(z.name)} settings`); flash(r ? 'Saved' : 'Saved — will sync when back online') }
      catch (e) { flash((e as Error).message) }
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
  const setTarget = (patch: Partial<Vals>) => { const n = { ...v, ...patch }; setV(level === 'custom' ? n : around(n, level)) }
  const step = (k: keyof Vals, d: number, lo: number, hi: number) => setV({ ...v, [k]: clamp(+(v[k] + d).toFixed(1), lo, hi) })
  const l = z.latest

  return (
    <div className="view settings">
      <PageHead title={zoneLabel(z.name)} onBack={onBack} />
      <p className="muted">Now {l ? `${l.temp.toFixed(1)} °C · ${Math.round(l.hum)} %` : '—'}. Changes are saved automatically.</p>

      <section>
        <h3>Keep at</h3>
        <Stepper label="Temperature" value={`${v.target_temp.toFixed(1)} °C`} onMinus={() => setTarget({ target_temp: clamp(+(v.target_temp - 0.5).toFixed(1), 4, 22) })} onPlus={() => setTarget({ target_temp: clamp(+(v.target_temp + 0.5).toFixed(1), 4, 22) })} />
        <Stepper label="Humidity" value={`${v.target_hum} %`} onMinus={() => setTarget({ target_hum: clamp(v.target_hum - 1, 40, 90) })} onPlus={() => setTarget({ target_hum: clamp(v.target_hum + 1, 40, 90) })} />
      </section>

      <section>
        <h3>Alert me when it drifts</h3>
        <div className="seg">
          {(['relaxed', 'standard', 'strict', 'custom'] as Level[]).map(k => (
            <button key={k} className={level === k ? 'on' : ''} onClick={() => { setLevel(k); if (k !== 'custom') setV(around(v, k)) }}>{k === 'custom' ? 'Custom' : LEVELS[k].label}</button>
          ))}
        </div>
        <p className="muted small">Outside {v.temp_min.toFixed(1)}–{v.temp_max.toFixed(1)} °C or {v.hum_min}–{v.hum_max} %.</p>
        {level === 'custom' && <>
          <Stepper label="Lowest temperature" value={`${v.temp_min.toFixed(1)} °C`} onMinus={() => step('temp_min', -0.5, 0, v.temp_max - 0.5)} onPlus={() => step('temp_min', 0.5, 0, v.temp_max - 0.5)} />
          <Stepper label="Highest temperature" value={`${v.temp_max.toFixed(1)} °C`} onMinus={() => step('temp_max', -0.5, v.temp_min + 0.5, 30)} onPlus={() => step('temp_max', 0.5, v.temp_min + 0.5, 30)} />
          <Stepper label="Lowest humidity" value={`${v.hum_min} %`} onMinus={() => step('hum_min', -1, 20, v.hum_max - 1)} onPlus={() => step('hum_min', 1, 20, v.hum_max - 1)} />
          <Stepper label="Highest humidity" value={`${v.hum_max} %`} onMinus={() => step('hum_max', -1, v.hum_min + 1, 95)} onPlus={() => step('hum_max', 1, v.hum_min + 1, 95)} />
        </>}
      </section>

      <section>
        <h3>Alert after</h3>
        <div className="seg">
          {DELAYS.map(m => <button key={m} className={v.alert_minutes === m ? 'on' : ''} onClick={() => setV({ ...v, alert_minutes: m })}>{m} min</button>)}
        </div>
      </section>
    </div>
  )
}
