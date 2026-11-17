import { useRef, useState, type ReactNode } from 'react'
import { api, apiBase, setApiBase, setToken } from '../api'
import { usePoll } from '../hooks'
import type { Cellar, CellarSummary, EnvZone, LlmInfo, User } from '../types'
import { Field, Modal } from '../components/ui'
import { initials } from '../components/Header'
import CellarsSettings from '../components/CellarsSettings'
import ClimateSettings from '../components/ClimateSettings'
import { Choices, Info, PageHead, Row } from '../components/SettingsUi'
import { applyPalette, getPalette, PALETTES, type PaletteId } from '../theme'
import { getSaver, NIGHT_FROM, NIGHT_TO, SAVER_AFTER, SAVER_STYLES, setSaver as saveSaver } from '../saver'

export type Orientation = 'auto' | 'portrait' | 'rotate'
type Sub = 'account' | 'cellars' | 'climate' | 'taste' | 'privacy' | 'about' | 'appearance' | 'saver'

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
  onPreviewSaver: () => void
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
  const [picker, setPicker] = useState<null | 'briefing'>(null)
  const [saverCfg, setSaverCfg] = useState(getSaver)
  const updSaver = (v: Parameters<typeof saveSaver>[0]) => { saveSaver(v); setSaverCfg(getSaver()) }
  const [palette, setPaletteState] = useState<PaletteId>(getPalette())
  const [msg, setMsg] = useState<string | null>(null)
  const flashT = useRef<number | null>(null)
  const flash = (m: string) => { setMsg(m); if (flashT.current) clearTimeout(flashT.current); flashT.current = window.setTimeout(() => setMsg(null), 2200) }

  const patchMe = async (body: Record<string, unknown>, ok?: string) => {
    try { onUser(await api<User>('PATCH', '/api/me', body)); if (ok) flash(ok); return true }
    catch (e) { flash((e as Error).message); return false }
  }
  const logout = async () => { try { await api('POST', '/api/auth/logout') } catch { /* offline */ } setToken(null); onUser(null) }

  const back = () => setSub(null)
  const toast = msg && <div className="saved-toast" role="status">{msg}</div>
  const page = (title: string, body: ReactNode) => (
    <>
      <div className="view settings">
        <PageHead title={title} onBack={back} />
        {body}
      </div>
      {toast}
    </>
  )

  if (sub === 'account') return page('Edit profile', <><p className="muted">Your name and sign-in details.</p><AccountForm user={user} onSave={patchMe} /></>)
  if (sub === 'cellars') return <><CellarsSettings cellars={cellars} onBack={back} onChanged={id => { p.onCellarsChanged(id); p.onCellarChanged() }} flash={flash} />{toast}</>
  if (sub === 'climate') return <><ClimateSettings cellarName={cellar?.name} zones={envZones} onBack={back} flash={flash} />{toast}</>
  if (sub === 'taste') return page('Taste preferences', <TasteForm user={user} onSave={patchMe} />)
  if (sub === 'privacy') return page('Privacy & data', <><p className="muted">Your data belongs to you. Take a copy or delete it.</p><PrivacyPage user={user} onDeleted={() => { setToken(null); onUser(null) }} /></>)
  if (sub === 'about') return page('About', <AboutPage user={user} />)
  if (sub === 'appearance') return page('Appearance', <>
    <p className="muted">How this display looks.</p>
    <section>
      <h3>Palette</h3>
      <Choices selected={palette} onPick={id => { applyPalette(id as PaletteId); setPaletteState(id as PaletteId) }}
               options={PALETTES.map(x => ({ id: x.id, title: x.name, detail: x.description, leading: <span className="swatch" style={{ background: x.swatch }} /> }))} />
    </section>
    <section>
      <h3>Screen</h3>
      <Choices selected={p.orientation} options={ORIENTATIONS} onPick={id => p.onOrientation(id as Orientation)} />
    </section>
  </>)
  if (sub === 'saver') return page('Screen saver', <>
    <p className="muted">After a while without a touch, the door shows a calm, mostly see-through screen. Tap anywhere to wake it.</p>
    <section>
      <h3>Start after</h3>
      <div className="seg">
        {SAVER_AFTER.map(([v, l]) => <button key={v} className={saverCfg.after === v ? 'on' : ''} onClick={() => updSaver({ after: v })}>{v ? l.replace('minutes', 'min').replace('minute', 'min') : 'Off'}</button>)}
      </div>
    </section>
    <section>
      <h3>Style</h3>
      <Choices selected={saverCfg.style} options={SAVER_STYLES.map(([id, title, detail]) => ({ id, title, detail }))}
               onPick={id => updSaver({ style: id as typeof saverCfg.style })} />
    </section>
    <section>
      <h3>Night mode</h3>
      <div className="seg">
        <button className={saverCfg.night ? 'on' : ''} onClick={() => updSaver({ night: true })}>On</button>
        <button className={!saverCfg.night ? 'on' : ''} onClick={() => updSaver({ night: false })}>Off</button>
      </div>
      <p className="muted small">From {NIGHT_FROM}:00 to 0{NIGHT_TO}:00 the screen saver shows only the clock and alerts.</p>
    </section>
    <button className="btn big start-btn" onClick={p.onPreviewSaver}>Preview screen saver</button>
  </>)

  const prefs = user.preferences
  const tasteCount = TASTE.reduce((n, g) => n + (prefs[g.key]?.length ?? 0), 0)
  const tasteSummary = tasteCount ? TASTE.flatMap(g => prefs[g.key] ?? []).slice(0, 2).join(', ') + (tasteCount > 2 ? ` +${tasteCount - 2}` : '') : 'Not set'
  const zoneCount = envZones?.length ?? 0

  return (
    <div className="view settings">
      <PageHead title="Profile" onBack={onBack} />
      {toast}

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
        <h3>This display</h3>
        <div className="rows">
          <Row label="Appearance" value={`${PALETTES.find(x => x.id === palette)!.name} · ${ORIENTATIONS.find(o => o.id === p.orientation)!.title}`}
               leading={<span className="swatch" style={{ background: PALETTES.find(x => x.id === palette)!.swatch }} />} onClick={() => setSub('appearance')} />
          <Row label="Screen saver" value={saverCfg.after ? `After ${saverCfg.after} min · ${SAVER_STYLES.find(x => x[0] === saverCfg.style)![1]}` : 'Off'} onClick={() => setSub('saver')} />
          <Row label="About" onClick={() => setSub('about')} />
        </div>
      </section>

      <button className="logout" onClick={logout}>Log out</button>

      {picker === 'briefing' && <BriefingTime value={user.briefing_time} onClose={() => setPicker(null)}
                                              onSave={async t => { if (await patchMe({ briefing_time: t }, 'Briefing time saved')) setPicker(null) }} />}
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
      <details className="advanced">
        <summary>Advanced</summary>
        <Field label="Server address (empty = default)">
          <input value={base} placeholder="http://10.0.2.2:8000" onChange={e => setBase(e.target.value)} />
        </Field>
        <button className="btn" onClick={() => { setApiBase(base); location.reload() }}>Save & reconnect</button>
      </details>
    </>
  )
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
