import { useEffect, useState } from 'react'
import { api, parseTs } from '../api'
import type { Cellar, CellarSummary, Device, Rack } from '../types'
import { Choices, PageHead, Row, Stepper } from './SettingsUi'

type Screen = { s: 'list' } | { s: 'cellar'; id: number } | { s: 'racks'; id: number } | { s: 'add'; attachTo?: number }
interface Props { cellars: CellarSummary[]; onBack: () => void; onChanged: (newId?: number) => void; flash: (m: string) => void }

/** My cellars: a short list first; each cellar, its racks and adding a cellar are one tap deeper. */
export default function CellarsSettings({ cellars, onBack, onChanged, flash }: Props) {
  const [screen, setScreen] = useState<Screen>({ s: 'list' })
  const [devices, setDevices] = useState<Device[]>([])
  const loadDevices = () => api<Device[]>('GET', '/api/devices').then(setDevices).catch(() => setDevices([]))
  useEffect(() => { void loadDevices(); const t = setInterval(loadDevices, 10_000); return () => clearInterval(t) }, [])
  const list = () => setScreen({ s: 'list' })

  if (screen.s === 'cellar') {
    const c = cellars.find(x => x.id === screen.id)
    if (!c) { list(); return null }
    return <CellarPage c={c} devices={devices.filter(d => d.cellar_id === c.id)} canRemove={cellars.length > 1} onBack={list}
                       onRacks={() => setScreen({ s: 'racks', id: c.id })} onLink={() => setScreen({ s: 'add', attachTo: c.id })}
                       onChanged={() => { onChanged(); void loadDevices() }} onRemoved={() => { onChanged(); list() }} flash={flash} />
  }
  if (screen.s === 'racks') return <RacksPage id={screen.id} onBack={() => setScreen({ s: 'cellar', id: screen.id })} onChanged={() => onChanged()} flash={flash} />
  if (screen.s === 'add') return <AddCellar cellars={cellars} attachTo={screen.attachTo} onBack={list}
                                            onDone={id => { onChanged(id); void loadDevices(); list() }} flash={flash} />

  return (
    <div className="view settings">
      <PageHead title="My cellars" onBack={onBack} />
      <p className="muted">Each cellar keeps its own bottles and climate.</p>
      <div className="rows">
        {cellars.map(c => {
          const ds = devices.filter(d => d.cellar_id === c.id)
          const st = !ds.length ? 'none' : ds.some(d => d.online) ? 'on' : 'off'
          return <Row key={c.id} label={c.name} value={`${c.bottle_count ?? 0} bottles`}
                      leading={<i className={`led cellar-led ${st}`} title={st === 'none' ? 'No appliance' : st === 'on' ? 'Online' : 'Offline'} />}
                      onClick={() => setScreen({ s: 'cellar', id: c.id })} />
        })}
        <Row label="＋ Add a cellar" onClick={() => setScreen({ s: 'add' })} />
      </div>
    </div>
  )
}

function CellarPage({ c, devices, canRemove, onBack, onRacks, onLink, onChanged, onRemoved, flash }: {
  c: CellarSummary; devices: Device[]; canRemove: boolean; onBack: () => void; onRacks: () => void; onLink: () => void
  onChanged: () => void; onRemoved: () => void; flash: (m: string) => void
}) {
  const [name, setName] = useState(c.name)
  const [confirm, setConfirm] = useState(false)
  const rename = async () => {
    if (!name.trim() || name === c.name) return
    try { await api('PATCH', `/api/cellars/${c.id}`, { name: name.trim() }); onChanged(); flash('Saved') } catch (e) { flash((e as Error).message) }
  }
  const unlink = async (d: Device) => { await api('DELETE', `/api/devices/${d.id}`); onChanged(); flash('Appliance unlinked') }
  const remove = async () => { try { await api('DELETE', `/api/cellars/${c.id}`); onRemoved() } catch (e) { flash((e as Error).message) } }
  const time = (ts: string) => parseTs(ts).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })

  return (
    <div className="view settings">
      <PageHead title={c.name} onBack={onBack} />
      <p className="muted">{c.bottle_count ?? 0} bottles · {c.width_cm} × {c.height_cm} × {c.depth_cm} cm</p>
      <section>
        <h3>Name</h3>
        <input value={name} maxLength={40} onChange={e => setName(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      </section>
      <section>
        <h3>Appliance</h3>
        <div className="rows">
          {devices.map(d => (
            <div key={d.id} className="set-row static">
              <i className={`led cellar-led ${d.online ? 'on' : 'off'}`} />
              <span className="br-main"><span className="br-title">{d.name || d.model || 'Cellar appliance'}</span>
                <span className="br-sub">{d.online ? 'Online' : d.last_seen ? `Last seen ${time(d.last_seen)}` : 'Never connected'}</span></span>
              <button className="link-btn danger-link" onClick={() => unlink(d)}>Unlink</button>
            </div>
          ))}
          {!devices.length && <p className="muted small">No appliance linked — bottles are managed by hand.</p>}
          <Row label={devices.length ? 'Link another camera or module' : 'Link an appliance'} onClick={onLink} />
        </div>
      </section>
      <section>
        <h3>Inside</h3>
        <div className="rows"><Row label="Racks" onClick={onRacks} /></div>
      </section>
      {canRemove && (confirm
        ? <div className="ask-box danger">
            <span className="t-heading">Delete {c.name}?</span>
            <span>Its bottles and climate history are deleted too. This cannot be undone.</span>
            <div className="row-btns"><button className="btn danger" onClick={remove}>Delete permanently</button><button className="btn" onClick={() => setConfirm(false)}>Keep it</button></div>
          </div>
        : <button className="logout" onClick={() => setConfirm(true)}>Delete this cellar</button>)}
    </div>
  )
}

/** Racks as simple rows: how full, capacity with − / +, pull out or put back. Changes save at once. */
function RacksPage({ id, onBack, onChanged, flash }: { id: number; onBack: () => void; onChanged: () => void; flash: (m: string) => void }) {
  const [cellar, setCellar] = useState<Cellar | null>(null)
  const [ask, setAsk] = useState<Rack | null>(null)
  const load = () => api<Cellar>('GET', `/api/cellars/${id}`).then(setCellar).catch(e => flash((e as Error).message))
  useEffect(() => { void load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => { void load(); onChanged() }
  const patch = async (r: Rack, body: Record<string, unknown>, ok = 'Saved') => {
    try { await api('PATCH', `/api/racks/${r.id}`, body); done(); flash(ok) } catch (e) { flash((e as Error).message) }
  }
  const del = async (r: Rack) => { try { await api('DELETE', `/api/racks/${r.id}`); done(); flash('Rack removed') } catch (e) { flash((e as Error).message) } }
  const add = async () => {
    if (!cellar) return
    // put the new rack in the middle of the biggest free gap
    const ys = [0, ...cellar.racks.filter(r => r.kind === 'shelf').map(r => r.y_cm), cellar.height_cm].sort((a, b) => a - b)
    let best = { gap: 0, y: cellar.height_cm / 2 }
    for (let k = 1; k < ys.length; k++) if (ys[k] - ys[k - 1] > best.gap) best = { gap: ys[k] - ys[k - 1], y: Math.round((ys[k] + ys[k - 1]) / 2) }
    try { await api('POST', `/api/cellars/${id}/racks`, { y_cm: best.y, capacity: 10 }); done(); flash('Rack added') } catch (e) { flash((e as Error).message) }
  }
  if (!cellar) return <div className="view settings"><PageHead title="Racks" onBack={onBack} /><p className="muted">Loading…</p></div>
  const racks = [...cellar.racks].sort((a, b) => b.y_cm - a.y_cm)

  return (
    <div className="view settings">
      <PageHead title="Racks" onBack={onBack} />
      <p className="muted">Pull a rack out to serve from it. Its bottles can travel with it.</p>
      {ask && (
        <div className="ask-box">
          <span className="t-heading">{ask.name} holds {ask.count} {ask.count === 1 ? 'bottle' : 'bottles'}.</span>
          <span>What happens to them?</span>
          <div className="row-btns">
            <button className="btn" onClick={() => { void patch(ask, { present: false, bottles: 'with_rack' }, 'Rack pulled out'); setAsk(null) }}>They come out with the rack</button>
            <button className="btn" onClick={() => { void patch(ask, { present: false, bottles: 'relocate' }, 'Bottles re-homed'); setAsk(null) }}>Move them to free spots</button>
            <button className="btn" onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="rows">
        {racks.map(r => (
          <div key={r.id} className={`rack-row ${r.present ? '' : 'out'}`}>
            <span className="br-main">
              <span className="br-title">{r.name}</span>
              <span className={`br-sub ${r.over_capacity ? 'warn-text-inline' : ''}`}>{r.present ? `${r.count} of ${r.capacity} bottles` : 'Pulled out'}</span>
            </span>
            {r.present && <Stepper label="Capacity" value={String(r.capacity)} onMinus={() => r.capacity > 1 && void patch(r, { capacity: r.capacity - 1 })} onPlus={() => void patch(r, { capacity: r.capacity + 1 })} />}
            {r.kind !== 'floor' && (r.present
              ? <button className="btn slim" onClick={() => (r.count ? setAsk(r) : void patch(r, { present: false }, 'Rack pulled out'))}>Pull out</button>
              : <button className="btn slim" onClick={() => void patch(r, { present: true }, 'Rack put back')}>Put back</button>)}
            {r.kind !== 'floor' && !r.count && <button className="icon-btn" aria-label={`Remove ${r.name}`} onClick={() => del(r)}>✕</button>}
          </div>
        ))}
      </div>
      <button className="btn big start-btn" onClick={add}>＋ Add a rack</button>
    </div>
  )
}

/** Adding a cellar asks one question first: an appliance with a code, or a cellar managed by hand. */
function AddCellar({ cellars, attachTo, onBack, onDone, flash }: { cellars: CellarSummary[]; attachTo?: number; onBack: () => void; onDone: (id?: number) => void; flash: (m: string) => void }) {
  const [mode, setMode] = useState<null | 'link' | 'manual'>(attachTo ? 'link' : null)
  const [presets, setPresets] = useState<Record<string, string>>({})
  const [f, setF] = useState({ code: '', target: attachTo ? String(attachTo) : 'new', name: '', preset: 'tall' })
  useEffect(() => { void api<Record<string, string>>('GET', '/api/cellar-presets').then(setPresets).catch(() => {}) }, [])

  const link = async () => {
    try {
      const r = await api<{ cellar: { id: number; name: string } }>('POST', '/api/devices/pair', {
        code: f.code, ...(f.target === 'new' ? { name: f.name.trim() || undefined, preset: f.preset } : { cellar_id: Number(f.target) }),
      })
      flash(`Linked to ${r.cellar.name}`); onDone(r.cellar.id)
    } catch (e) { flash((e as Error).message) }
  }
  const manual = async () => {
    try { const c = await api<{ id: number }>('POST', '/api/cellars', { name: f.name.trim() || 'New Cellar', preset: f.preset }); flash('Cellar added'); onDone(c.id) }
    catch (e) { flash((e as Error).message) }
  }
  const presetChoices = Object.entries(presets).map(([id, label]) => {
    const [title, detail] = label.split(' (')
    return { id, title, detail: detail ? detail.replace(')', '') : undefined }
  })

  if (!mode) return (
    <div className="view settings">
      <PageHead title="Add a cellar" onBack={onBack} />
      <Choices selected="" onPick={id => setMode(id as 'link' | 'manual')} options={[
        { id: 'link', title: 'Link a new appliance', detail: 'Enter the 6-digit code shown on its screen' },
        { id: 'manual', title: 'Add without a device', detail: 'Keep track of the bottles by hand' },
      ]} />
    </div>
  )

  const newCellar = f.target === 'new'
  return (
    <div className="view settings">
      <PageHead title={mode === 'link' ? 'Link an appliance' : 'Add a cellar'} onBack={attachTo ? onBack : () => setMode(null)} />
      {mode === 'link' && <>
        <p className="muted">Power on the appliance. It shows a 6-digit code on its screen.</p>
        <input className="code-input" inputMode="numeric" maxLength={6} placeholder="000000" value={f.code}
               onChange={e => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} aria-label="Pairing code" />
        {!attachTo && cellars.length > 0 && (
          <section>
            <h3>It is</h3>
            <Choices selected={f.target} onPick={id => setF({ ...f, target: id })}
                     options={[{ id: 'new', title: 'A new cellar' }, ...cellars.map(c => ({ id: String(c.id), title: `An extra camera for ${c.name}` }))]} />
          </section>
        )}
      </>}
      {(mode === 'manual' || newCellar) && <>
        <section>
          <h3>Name</h3>
          <input value={f.name} maxLength={40} placeholder="e.g. Kitchen cellar" onChange={e => setF({ ...f, name: e.target.value })} />
        </section>
        {presetChoices.length > 0 && <section><h3>Cabinet</h3><Choices selected={f.preset} options={presetChoices} onPick={id => setF({ ...f, preset: id })} /></section>}
      </>}
      {mode === 'link'
        ? <button className="btn primary big start-btn" disabled={f.code.length !== 6} onClick={link}>Link</button>
        : <button className="btn primary big start-btn" onClick={manual}>Add cellar</button>}
    </div>
  )
}
