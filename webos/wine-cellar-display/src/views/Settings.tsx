import { useState } from 'react'
import { api, apiBase, mutateOrQueue, setApiBase, setToken } from '../api'
import { useDraft } from '../hooks'
import type { Cellar, CellarSummary, EnvZone, User } from '../types'
import { Field } from '../components/ui'
import RackEditor from '../components/RackEditor'
import LinkedCellars from '../components/LinkedCellars'

export type Orientation = 'auto' | 'portrait' | 'rotate'

interface Props {
  user: User
  onUser: (u: User | null) => void
  cellar: Cellar | null
  cellars: CellarSummary[]
  envZones: EnvZone[] | undefined
  onCellarsChanged: (newId?: number) => void
  onCellarChanged: () => void
  orientation: Orientation
  onOrientation: (o: Orientation) => void
}

export default function Settings({ user, onUser, cellar, cellars, envZones, onCellarsChanged, onCellarChanged, orientation, onOrientation }: Props) {
  const [prof, setProf] = useDraft('profile', { display_name: user.display_name, email: user.email, briefing_time: user.briefing_time, likes: user.preferences.likes ?? '', dislikes: user.preferences.dislikes ?? '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [base, setBase] = useState(apiBase())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }

  const saveProfile = async () => {
    try {
      const u = await api<User>('PATCH', '/api/me', { display_name: prof.display_name, email: prof.email, briefing_time: prof.briefing_time, preferences: { likes: prof.likes, dislikes: prof.dislikes } })
      onUser(u); flash('Profile saved')
    } catch (e) { flash((e as Error).message) }
  }
  const saveZone = async (z: EnvZone, patch: Partial<EnvZone>) => {
    try {
      const r = await mutateOrQueue('PATCH', `/api/zones/${z.id}`, patch, `${z.name} settings`)
      flash(r ? 'Zone updated' : 'Offline — will sync when the cloud is back')
    } catch (e) { flash((e as Error).message) }
  }
  const sim = async (zone_id: number, action: string) => { await api('POST', '/api/simulator/sensors', { zone_id, action }); flash(`Simulator: ${action}`) }
  const exportData = async () => {
    const data = await api('GET', '/api/me/export')
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `wine-cellar-export-${user.username}.json`; a.click()
    URL.revokeObjectURL(url)
  }
  const deleteAccount = async () => { await api('DELETE', '/api/me'); setToken(null); onUser(null) }
  const logout = async () => { try { await api('POST', '/api/auth/logout') } catch { /* offline */ } setToken(null); onUser(null) }

  return (
    <div className="view settings">
      <h2 className="view-title">Settings</h2>
      {msg && <div className="toast">{msg}</div>}

      <section className="card">
        <h3>Profile</h3>
        <div className="form-grid">
          <Field label="Display name"><input value={prof.display_name} onChange={e => setProf({ ...prof, display_name: e.target.value })} /></Field>
          <Field label="Email"><input value={prof.email} onChange={e => setProf({ ...prof, email: e.target.value })} /></Field>
          <Field label="Daily briefing push time"><input type="time" value={prof.briefing_time} onChange={e => setProf({ ...prof, briefing_time: e.target.value })} /></Field>
          <Field label="Username"><input value={user.username} readOnly /></Field>
          <Field label="I like (styles, regions)"><input value={prof.likes} onChange={e => setProf({ ...prof, likes: e.target.value })} /></Field>
          <Field label="I avoid"><input value={prof.dislikes} onChange={e => setProf({ ...prof, dislikes: e.target.value })} /></Field>
        </div>
        <button className="btn primary" onClick={saveProfile}>Save profile</button>
      </section>

      {cellar && envZones && (
        <section className="card">
          <h3>Climate control · {cellar.name}</h3>
          {envZones.map(z => <ZoneEditor key={z.id} z={z} onSave={p => saveZone(z, p)} onSim={a => sim(z.id, a)} />)}
        </section>
      )}

      {cellar && (
        <section className="card">
          <h3>Racks · {cellar.name}</h3>
          <RackEditor cellar={cellar} onChanged={onCellarChanged} flash={flash} />
        </section>
      )}

      <section className="card">
        <h3>Linked cellars & devices</h3>
        <LinkedCellars cellars={cellars} currentId={cellar?.id ?? null} onChanged={onCellarsChanged} flash={flash} />
      </section>

      <section className="card">
        <h3>Display & connection</h3>
        <div className="seg">
          {(['auto', 'portrait', 'rotate'] as Orientation[]).map(o => (
            <button key={o} className={orientation === o ? 'on' : ''} onClick={() => onOrientation(o)}>
              {o === 'auto' ? 'Auto (rotate on landscape screens)' : o === 'portrait' ? 'Portrait panel' : 'Always rotate 90°'}
            </button>
          ))}
        </div>
        <Field label="Backend URL (empty = default)">
          <input value={base} placeholder="http://10.0.2.2:8000" onChange={e => setBase(e.target.value)} />
        </Field>
        <button className="btn" onClick={() => { setApiBase(base); location.reload() }}>Save & reload</button>
      </section>

      <section className="card">
        <h3>Your data</h3>
        <p className="muted small">Export everything stored about you, or permanently delete your account and all cellar data.</p>
        <div className="row-btns">
          <button className="btn" onClick={exportData}>⬇ Export my data (JSON)</button>
          <button className="btn" onClick={logout}>Log out</button>
          {confirmDelete
            ? <><button className="btn danger" onClick={deleteAccount}>Delete permanently</button><button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button></>
            : <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete account</button>}
        </div>
      </section>
    </div>
  )
}

function ZoneEditor({ z, onSave, onSim }: { z: EnvZone; onSave: (p: Partial<EnvZone>) => void; onSim: (a: string) => void }) {
  const [v, setV] = useState({ target_temp: z.target_temp, target_hum: z.target_hum, temp_min: z.temp_min, temp_max: z.temp_max, hum_min: z.hum_min, hum_max: z.hum_max, alert_minutes: z.alert_minutes })
  const num = (k: keyof typeof v) => (
    <input inputMode="decimal" value={v[k]} onChange={e => setV({ ...v, [k]: Number(e.target.value) })} />
  )
  return (
    <div className="zone-editor">
      <div className="zone-editor-head">
        <b>{z.name}</b>
        <span className="muted small">now {z.latest ? `${z.latest.temp.toFixed(1)}°C · ${Math.round(z.latest.hum)}%` : '—'}</span>
      </div>
      <div className="stepper">
        <span>Target temp</span>
        <button className="btn" onClick={() => setV({ ...v, target_temp: +(v.target_temp - 0.5).toFixed(1) })}>−</button>
        <b className="step-val">{v.target_temp.toFixed(1)}°C</b>
        <button className="btn" onClick={() => setV({ ...v, target_temp: +(v.target_temp + 0.5).toFixed(1) })}>+</button>
        <span>Target humidity</span>
        <button className="btn" onClick={() => setV({ ...v, target_hum: v.target_hum - 1 })}>−</button>
        <b className="step-val">{v.target_hum}%</b>
        <button className="btn" onClick={() => setV({ ...v, target_hum: v.target_hum + 1 })}>+</button>
      </div>
      <div className="form-grid four">
        <Field label="Temp min">{num('temp_min')}</Field>
        <Field label="Temp max">{num('temp_max')}</Field>
        <Field label="Hum min">{num('hum_min')}</Field>
        <Field label="Hum max">{num('hum_max')}</Field>
        <Field label="Alert after (min)">{num('alert_minutes')}</Field>
      </div>
      <div className="row-btns">
        <button className="btn primary" onClick={() => onSave(v)}>Apply</button>
        <span className="muted small">Simulate:</span>
        <button className="btn" onClick={() => onSim(z.simulated_spike ? 'normal' : 'spike')}>{z.simulated_spike ? 'End heat spike' : 'Heat spike'}</button>
        <button className="btn" onClick={() => onSim(z.simulated_disconnect ? 'reconnect' : 'disconnect')}>{z.simulated_disconnect ? 'Reconnect sensor' : 'Disconnect sensor'}</button>
      </div>
    </div>
  )
}
