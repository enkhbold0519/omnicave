import { useEffect, useState } from 'react'
import { api, parseTs } from '../api'
import type { CellarSummary, Device } from '../types'

interface Props { cellars: CellarSummary[]; currentId: number | null; onChanged: (newId?: number) => void; flash: (m: string) => void }

/** FR8: link several physical cellar units (and camera modules) to one account. */
export default function LinkedCellars({ cellars, currentId, onChanged, flash }: Props) {
  const [presets, setPresets] = useState<Record<string, string>>({})
  const [devices, setDevices] = useState<Device[]>([])
  const [link, setLink] = useState({ code: '', target: 'new', name: '', preset: 'tall' })
  const [sim, setSim] = useState<{ uid: string; code: string } | null>(null)

  const load = () => api<Device[]>('GET', '/api/devices').then(setDevices).catch(() => setDevices([]))
  useEffect(() => {
    void api<Record<string, string>>('GET', '/api/cellar-presets').then(setPresets).catch(() => {})
    void load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [])

  const doLink = async () => {
    try {
      const r = await api<{ cellar: { id: number; name: string } }>('POST', '/api/devices/pair', {
        code: link.code.trim(),
        ...(link.target === 'new' ? { name: link.name || undefined, preset: link.preset } : { cellar_id: Number(link.target) }),
      })
      flash(`Linked → ${r.cellar.name}`); setLink({ ...link, code: '', name: '' }); setSim(null); void load(); onChanged(r.cellar.id)
    } catch (e) { flash((e as Error).message) }
  }
  const simulate = async () => {
    const uid = 'WC-DEMO-' + Math.random().toString(16).slice(2, 8).toUpperCase()
    const r = await api<{ pairing_code: string }>('POST', '/api/devices/register', { uid, model: 'Demo wine cellar (simulated appliance)' })
    setSim({ uid, code: r.pairing_code })
  }
  const unlink = async (d: Device) => { await api('DELETE', `/api/devices/${d.id}`); void load(); onChanged() }
  const rename = async (id: number, name: string) => { try { await api('PATCH', `/api/cellars/${id}`, { name }); onChanged() } catch (e) { flash((e as Error).message) } }
  const remove = async (id: number) => { try { await api('DELETE', `/api/cellars/${id}`); onChanged() } catch (e) { flash((e as Error).message) } }
  const addPlain = async () => {
    try { const c = await api<{ id: number }>('POST', '/api/cellars', { name: link.name || 'New Cellar', preset: link.preset }); onChanged(c.id) }
    catch (e) { flash((e as Error).message) }
  }

  return (
    <div className="linked">
      {cellars.map(c => (
        <CellarCard key={c.id} c={c} current={c.id === currentId} devices={devices.filter(d => d.cellar_id === c.id)}
                    onRename={n => rename(c.id, n)} onRemove={() => remove(c.id)} onUnlink={unlink} canRemove={cellars.length > 1} />
      ))}

      <div className="link-box">
        <h4>Link a cellar appliance</h4>
        <p className="muted small">Power on the new cellar — it shows a 6-digit code on its screen (or run <code>edge/edge_agent.py</code>). Enter it here.</p>
        <div className="form-grid">
          <label className="field"><span>Pairing code</span>
            <input inputMode="numeric" maxLength={6} value={link.code} onChange={e => setLink({ ...link, code: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="field"><span>Attach to</span>
            <select value={link.target} onChange={e => setLink({ ...link, target: e.target.value })}>
              <option value="new">New cellar</option>
              {cellars.map(c => <option key={c.id} value={c.id}>{c.name} (extra camera / module)</option>)}
            </select></label>
          {link.target === 'new' && <>
            <label className="field"><span>Name</span><input value={link.name} placeholder="Kitchen cellar" onChange={e => setLink({ ...link, name: e.target.value })} /></label>
            <label className="field"><span>Cabinet type</span>
              <select value={link.preset} onChange={e => setLink({ ...link, preset: e.target.value })}>
                {Object.entries(presets).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
          </>}
        </div>
        <div className="row-btns">
          <button className="btn primary" disabled={link.code.length !== 6} onClick={doLink}>Link</button>
          <button className="btn" onClick={simulate}>Simulate a new appliance</button>
          <button className="btn" onClick={addPlain}>Add cellar without a device</button>
        </div>
        {sim && (
          <div className="sim-screen">
            <div className="muted tiny">{sim.uid} screen</div>
            <div className="sim-code">{sim.code}</div>
            <button className="btn" onClick={() => setLink({ ...link, code: sim.code })}>Use this code</button>
          </div>
        )}
      </div>
    </div>
  )
}

function CellarCard({ c, current, devices, onRename, onRemove, onUnlink, canRemove }: {
  c: CellarSummary; current: boolean; devices: Device[]; onRename: (n: string) => void; onRemove: () => void; onUnlink: (d: Device) => void; canRemove: boolean
}) {
  const [name, setName] = useState(c.name)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className={`cellar-card ${current ? 'current' : ''}`}>
      <div className="cc-head">
        <input value={name} onChange={e => setName(e.target.value)} onBlur={() => name !== c.name && onRename(name)} />
        <span className="muted small">{c.bottle_count ?? 0} bottles · {c.width_cm}×{c.height_cm}×{c.depth_cm} cm</span>
      </div>
      {devices.length === 0 && <div className="muted small">No device linked — inventory is managed manually / simulated.</div>}
      {devices.map(d => (
        <div key={d.id} className="dev-row">
          <i className={`led ${d.online ? 'on' : ''}`} />
          <span><b>{d.name || d.uid}</b> <span className="muted tiny">{d.uid}</span></span>
          <span className="muted tiny">{d.online ? 'online' : d.last_seen ? `last seen ${parseTs(d.last_seen).toLocaleTimeString('ko-KR')}` : 'never connected'}
            {d.last_scan ? ` · last scan ${parseTs(d.last_scan).toLocaleTimeString('ko-KR')}` : ''}</span>
          <button className="btn" onClick={() => onUnlink(d)}>Unlink</button>
        </div>
      ))}
      {canRemove && (confirm
        ? <div className="row-btns"><span className="muted small">Delete this cellar and its inventory?</span><button className="btn danger" onClick={onRemove}>Delete</button><button className="btn" onClick={() => setConfirm(false)}>Cancel</button></div>
        : <button className="btn danger slim" onClick={() => setConfirm(true)}>Delete cellar</button>)}
    </div>
  )
}
