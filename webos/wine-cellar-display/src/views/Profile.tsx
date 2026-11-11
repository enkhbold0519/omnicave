import { useState, type ReactNode } from 'react'
import { api, apiBase, mutateOrQueue, setApiBase, setToken } from '../api'
import { usePoll } from '../hooks'
import type { Cellar, CellarSummary, EnvZone, LlmInfo, User } from '../types'
import { Field, Modal } from '../components/ui'
import Icon from '../components/Icon'
import { initials } from '../components/Header'
import RackEditor from '../components/RackEditor'
import LinkedCellars from '../components/LinkedCellars'
import { applyPalette, getPalette, PALETTES, type PaletteId } from '../theme'

export type Orientation = 'auto' | 'portrait' | 'rotate'
type Sub = 'account' | 'cellars' | 'climate' | 'taste' | 'privacy' | 'about'

interface Props {
  onBack: () => void
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

const ORIENTATIONS: { id: Orientation; title: string; detail: string }[] = [
  { id: 'auto', title: 'Automatic', detail: 'Rotate on landscape screens' },
  { id: 'portrait', title: 'Portrait', detail: 'For the cellar door panel' },
  { id: 'rotate', title: 'Always rotate', detail: 'Turn the picture 90°' },
]

/** Same groups and choices as the Android app's taste preferences. */
const TASTE: { key: 'styles' | 'regions' | 'grapes'; title: string; options: string[] }[] = [
  { key: 'styles', title: 'Styles', options: ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert'] },
  { key: 'regions', title: 'Regions', options: ['Bordeaux', 'Burgundy', 'Champagne', 'Rhône', 'Piedmont', 'Tuscany', 'Rioja', 'Mosel', 'Napa', 'Mendoza'] },
  { key: 'grapes', title: 'Grapes', options: ['Cabernet Sauvignon', 'Pinot Noir', 'Nebbiolo', 'Syrah', 'Sangiovese', 'Tempranillo', 'Chardonnay', 'Riesling', 'Sauvignon Blanc', 'Grenache'] },
]

/** Profile (opened from the avatar) with the settings list below it, like the Android Profile tab. */
export default function Profile(p: Props) {
  const { onBack, user, onUser, cellar, cellars, envZones } = p
  const [sub, setSub] = useState<Sub | null>(null)
  const [picker, setPicker] = useState<null | 'palette' | 'orientation' | 'briefing'>(null)
  const [palette, setPaletteState] = useState<PaletteId>(getPalette())
  const [msg, setMsg] = useState<string | null>(null)
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }

  const patchMe = async (body: Record<string, unknown>, ok?: string) => {
    try { onUser(await api<User>('PATCH', '/api/me', body)); if (ok) flash(ok); return true }
    catch (e) { flash((e as Error).message); return false }
  }
  const logout = async () => { try { await api('POST', '/api/auth/logout') } catch { /* offline */ } setToken(null); onUser(null) }

  const back = () => setSub(null)
  const page = (title: string, body: ReactNode) => (
    <div className="view settings">
      <PageHead title={title} onBack={back} />
      {msg && <div className="toast">{msg}</div>}
      {body}
    </div>
  )

  if (sub === 'account') return page('Edit profile', <AccountForm user={user} onSave={patchMe} />)
  if (sub === 'cellars') return page('My cellars', <>
    <LinkedCellars cellars={cellars} currentId={cellar?.id ?? null} onChanged={p.onCellarsChanged} flash={flash} />
    {cellar && <section><h3>Racks · {cellar.name}</h3><RackEditor cellar={cellar} onChanged={p.onCellarChanged} flash={flash} /></section>}
  </>)
  if (sub === 'climate') return page('Climate & alerts', <>
    <p className="muted">{cellar ? `For ${cellar.name}. ` : ''}You get a notification when a zone stays outside its range.</p>
    {envZones?.map(z => <ZoneEditor key={z.id} z={z} flash={flash} />)}
  </>)
  if (sub === 'taste') return page('Taste preferences', <TasteForm user={user} onSave={patchMe} />)
  if (sub === 'privacy') return page('Privacy & data', <PrivacyPage user={user} onDeleted={() => { setToken(null); onUser(null) }} />)
  if (sub === 'about') return page('About', <AboutPage user={user} />)

  const prefs = user.preferences
  const tasteCount = TASTE.reduce((n, g) => n + (prefs[g.key]?.length ?? 0), 0)
  const tasteSummary = tasteCount ? TASTE.flatMap(g => prefs[g.key] ?? []).slice(0, 2).join(', ') + (tasteCount > 2 ? ` +${tasteCount - 2}` : '') : 'Not set'
  const zoneCount = envZones?.length ?? 0

  return (
    <div className="view settings">
      <PageHead title="Profile" onBack={onBack} />
      {msg && <div className="toast">{msg}</div>}

      <div className="profile-hero">
        <div className="avatar-lg" aria-hidden="true">{initials(user)}</div>
        <div className="t-display">{user.display_name || user.username}</div>
        <div className="muted small">Signed in as {user.username}{user.email ? ` · ${user.email}` : ''}</div>
        <button className="link-btn" onClick={() => setSub('account')}>Edit profile</button>
      </div>

      <section>
        <h3>Settings</h3>
        <div className="rows">
          <Row label="My cellars" value={`${cellars.length} ${cellars.length === 1 ? 'cellar' : 'cellars'}`} onClick={() => setSub('cellars')} />
          {cellar && <Row label="Climate & alerts" value={`${cellar.name} · ${zoneCount} ${zoneCount === 1 ? 'zone' : 'zones'}`} onClick={() => setSub('climate')} />}
          <Row label="Taste preferences" value={tasteSummary} onClick={() => setSub('taste')} />
          <Row label="Daily briefing" value={`Sent at ${user.briefing_time}`} kind="pick" onClick={() => setPicker('briefing')} />
          <Row label="Privacy & data" onClick={() => setSub('privacy')} />
        </div>
      </section>

      <section>
        <h3>Appearance</h3>
        <div className="rows">
          <Row label="Palette" kind="pick" value={PALETTES.find(x => x.id === palette)!.name}
               leading={<span className="swatch" style={{ background: PALETTES.find(x => x.id === palette)!.swatch }} />} onClick={() => setPicker('palette')} />
          <Row label="Screen" kind="pick" value={ORIENTATIONS.find(o => o.id === p.orientation)!.title} onClick={() => setPicker('orientation')} />
          <Row label="About" onClick={() => setSub('about')} />
        </div>
      </section>

      <button className="logout" onClick={logout}>Log out</button>

      {picker === 'palette' && (
        <Picker title="Palette" selected={palette} onClose={() => setPicker(null)}
                options={PALETTES.map(x => ({ id: x.id, title: x.name, detail: x.description, leading: <span className="swatch" style={{ background: x.swatch }} /> }))}
                onPick={id => { applyPalette(id as PaletteId); setPaletteState(id as PaletteId); setPicker(null) }} />
      )}
      {picker === 'orientation' && (
        <Picker title="Screen" selected={p.orientation} onClose={() => setPicker(null)} options={ORIENTATIONS}
                onPick={id => { p.onOrientation(id as Orientation); setPicker(null) }} />
      )}
      {picker === 'briefing' && <BriefingTime value={user.briefing_time} onClose={() => setPicker(null)}
                                              onSave={async t => { if (await patchMe({ briefing_time: t }, 'Briefing time saved')) setPicker(null) }} />}
    </div>
  )
}

/* ---------- building blocks ---------- */

function PageHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="page-head">
      <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
      <h2>{title}</h2>
    </div>
  )
}

/** Label on the left, current value and a chevron on the right (Android SettingRow). */
function Row({ label, value, leading, kind = 'open', onClick }: { label: string; value?: string; leading?: ReactNode; kind?: 'open' | 'pick'; onClick: () => void }) {
  return (
    <button className="set-row" onClick={onClick} aria-label={value ? `${label}: ${value}` : label}>
      <span className="set-label">{label}</span>
      {leading}
      <span className="set-value">{value}</span>
      <span className={`set-chev ${kind}`}><Icon name="chevron" size={24} /></span>
    </button>
  )
}

function Picker({ title, options, selected, onPick, onClose }: {
  title: string; options: { id: string; title: string; detail?: string; leading?: ReactNode }[]; selected: string; onPick: (id: string) => void; onClose: () => void
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rows">
        {options.map(o => (
          <button key={o.id} className={`pick-row ${o.id === selected ? 'on' : ''}`} onClick={() => onPick(o.id)} aria-pressed={o.id === selected}>
            {o.leading}
            <span className="br-main"><span className="br-title">{o.title}</span>{o.detail && <span className="br-sub">{o.detail}</span>}</span>
            {o.id === selected && <span className="pick-check">✓</span>}
          </button>
        ))}
      </div>
    </Modal>
  )
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="stepper-row">
      <span>{label}</span>
      <div className="stepper-ctl">
        <button className="step-btn" onClick={onMinus} aria-label={`Lower ${label}`}>−</button>
        <b className="step-val">{value}</b>
        <button className="step-btn" onClick={onPlus} aria-label={`Raise ${label}`}>+</button>
      </div>
    </div>
  )
}

/* ---------- sub-pages ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function AccountForm({ user, onSave }: { user: User; onSave: (b: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [f, setF] = useState({ display_name: user.display_name, email: user.email, password: '', confirm: '' })
  const emailOk = EMAIL_RE.test(f.email.trim())
  const pwOk = !f.password || (f.password.length >= 8 && f.password === f.confirm)
  const save = async () => {
    const body: Record<string, unknown> = { display_name: f.display_name.trim(), email: f.email.trim() }
    if (f.password) body.password = f.password
    if (await onSave(body, 'Changes saved')) setF({ ...f, password: '', confirm: '' })
  }
  return (
    <div className="form-col">
      <Field label="Name"><input value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} /></Field>
      <Field label="Email"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      {!emailOk && f.email && <span className="error small">Enter a valid email address</span>}
      <Field label="New password"><input type="password" value={f.password} placeholder="Leave empty to keep it" onChange={e => setF({ ...f, password: e.target.value })} /></Field>
      {f.password && <Field label="Repeat new password"><input type="password" value={f.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} /></Field>}
      {f.password && !pwOk && <span className="error small">{f.password.length < 8 ? 'At least 8 characters' : 'Passwords do not match'}</span>}
      <p className="muted small">Username: {user.username} (cannot be changed)</p>
      <button className="btn primary big" disabled={!emailOk || !pwOk} onClick={save}>Save Changes</button>
    </div>
  )
}

function TasteForm({ user, onSave }: { user: User; onSave: (b: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const prefs = user.preferences
  const [avoid, setAvoid] = useState(prefs.dislikes ?? '')
  const toggle = (key: 'styles' | 'regions' | 'grapes', item: string) => {
    const cur = prefs[key] ?? []
    void onSave({ preferences: { ...prefs, [key]: cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item] } })
  }
  return (
    <>
      <p className="muted">The sommeliers use these when they recommend wines for you.</p>
      {TASTE.map(g => (
        <section key={g.key}>
          <h3>{g.title}</h3>
          <div className="chip-row">
            {g.options.map(o => {
              const on = (prefs[g.key] ?? []).includes(o)
              return <button key={o} className={`pill ${on ? 'on' : ''}`} role="checkbox" aria-checked={on} onClick={() => toggle(g.key, o)}>{o}</button>
            })}
          </div>
        </section>
      ))}
      <section>
        <h3>Anything you avoid</h3>
        <input value={avoid} placeholder="e.g. very oaky whites" onChange={e => setAvoid(e.target.value)}
               onBlur={() => avoid !== (prefs.dislikes ?? '') && void onSave({ preferences: { ...prefs, dislikes: avoid } }, 'Saved')} />
      </section>
    </>
  )
}

function ZoneEditor({ z, flash }: { z: EnvZone; flash: (m: string) => void }) {
  const [v, setV] = useState({ target_temp: z.target_temp, target_hum: z.target_hum, temp_min: z.temp_min, temp_max: z.temp_max, hum_min: z.hum_min, hum_max: z.hum_max, alert_minutes: z.alert_minutes })
  const changed = (Object.keys(v) as (keyof typeof v)[]).some(k => v[k] !== z[k])
  const step = (k: keyof typeof v, d: number, min: number, max: number) => setV({ ...v, [k]: Math.min(max, Math.max(min, +(v[k] + d).toFixed(1))) })
  const save = async () => {
    try {
      const r = await mutateOrQueue('PATCH', `/api/zones/${z.id}`, v, `${z.name} settings`)
      flash(r ? `${z.name} updated` : 'Offline — will sync when the connection is back')
    } catch (e) { flash((e as Error).message) }
  }
  return (
    <section className="zone-editor">
      <div className="zone-editor-head">
        <span className="t-heading">{z.name}</span>
        <span className="muted small">Now {z.latest ? `${z.latest.temp.toFixed(1)} °C · ${Math.round(z.latest.hum)} %` : '—'}</span>
      </div>
      <h3>Keep at</h3>
      <Stepper label="Temperature" value={`${v.target_temp.toFixed(1)} °C`} onMinus={() => step('target_temp', -0.5, 4, 22)} onPlus={() => step('target_temp', 0.5, 4, 22)} />
      <Stepper label="Humidity" value={`${v.target_hum} %`} onMinus={() => step('target_hum', -1, 40, 90)} onPlus={() => step('target_hum', 1, 40, 90)} />
      <h3>Alert me outside</h3>
      <Stepper label="Lowest temperature" value={`${v.temp_min.toFixed(1)} °C`} onMinus={() => step('temp_min', -0.5, 0, v.temp_max - 0.5)} onPlus={() => step('temp_min', 0.5, 0, v.temp_max - 0.5)} />
      <Stepper label="Highest temperature" value={`${v.temp_max.toFixed(1)} °C`} onMinus={() => step('temp_max', -0.5, v.temp_min + 0.5, 30)} onPlus={() => step('temp_max', 0.5, v.temp_min + 0.5, 30)} />
      <Stepper label="Lowest humidity" value={`${v.hum_min} %`} onMinus={() => step('hum_min', -1, 20, v.hum_max - 1)} onPlus={() => step('hum_min', 1, 20, v.hum_max - 1)} />
      <Stepper label="Highest humidity" value={`${v.hum_max} %`} onMinus={() => step('hum_max', -1, v.hum_min + 1, 95)} onPlus={() => step('hum_max', 1, v.hum_min + 1, 95)} />
      <Stepper label="For at least" value={`${v.alert_minutes} min`} onMinus={() => step('alert_minutes', -5, 5, 240)} onPlus={() => step('alert_minutes', 5, 5, 240)} />
      <button className="btn primary" disabled={!changed} onClick={save}>Apply</button>
    </section>
  )
}

function PrivacyPage({ user, onDeleted }: { user: User; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const exportData = async () => {
    const data = await api('GET', '/api/me/export')
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `cellaros-export-${user.username}.json`; a.click()
    URL.revokeObjectURL(url)
  }
  const del = async () => { await api('DELETE', '/api/me'); onDeleted() }
  return (
    <>
      <div className="rows">
        <Row label="Export my data" value="JSON file" onClick={exportData} />
        <Row label="Delete account" onClick={() => setConfirm(true)} />
      </div>
      {confirm && (
        <div className="ask-box danger">
          <span className="t-heading">Delete your account?</span>
          <span>Your account, every cellar and all bottle history are deleted for good. This cannot be undone.</span>
          <div className="row-btns">
            <button className="btn danger" onClick={del}>Delete permanently</button>
            <button className="btn" onClick={() => setConfirm(false)}>Keep my account</button>
          </div>
        </div>
      )}
    </>
  )
}

function AboutPage({ user }: { user: User }) {
  const health = usePoll<{ llm: LlmInfo; vision: { provider: string } }>('/api/health', 60_000)
  const [base, setBase] = useState(apiBase())
  const llm = health.data?.llm
  return (
    <>
      <div className="rows">
        <Info label="Signed in as" value={user.username} />
        <Info label="AI sommeliers" value={!llm ? '—' : llm.provider === 'mock' ? 'Offline demo' : `${llm.model}`} />
        <Info label="Camera recognition" value={health.data ? (health.data.vision.provider === 'mock' ? 'Offline demo' : health.data.vision.provider) : '—'} />
        <Info label="Version" value="CellarOS display 0.3" />
      </div>
      <section>
        <h3>Server</h3>
        <Field label="Server address (empty = default)">
          <input value={base} placeholder="http://10.0.2.2:8000" onChange={e => setBase(e.target.value)} />
        </Field>
        <button className="btn" onClick={() => { setApiBase(base); location.reload() }}>Save & reconnect</button>
      </section>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="set-row static"><span className="set-label">{label}</span><span className="set-value">{value}</span></div>
}

function BriefingTime({ value, onSave, onClose }: { value: string; onSave: (t: string) => void; onClose: () => void }) {
  const [t, setT] = useState(value)
  return (
    <Modal title="Daily briefing" onClose={onClose}>
      <p className="muted">A short summary of your cellar and wine news is sent to your phone at this time.</p>
      <input type="time" className="time-input" value={t} onChange={e => setT(e.target.value)} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!/^\d\d:\d\d$/.test(t)} onClick={() => onSave(t)}>Save</button>
      </div>
    </Modal>
  )
}
