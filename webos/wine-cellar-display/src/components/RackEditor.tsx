import { useState } from 'react'
import { api } from '../api'
import type { Cellar, Rack } from '../types'

/** Racks are removable and only have a *nominal* capacity (free mapping). */
export default function RackEditor({ cellar, onChanged, flash }: { cellar: Cellar; onChanged: () => void; flash: (m: string) => void }) {
  const [ask, setAsk] = useState<Rack | null>(null)
  const [add, setAdd] = useState({ y: '', cap: '10' })
  const racks = [...cellar.racks].sort((a, b) => b.y_cm - a.y_cm)

  const patch = async (r: Rack, body: Record<string, unknown>) => {
    try { await api('PATCH', `/api/racks/${r.id}`, body); onChanged() } catch (e) { flash((e as Error).message) }
  }
  const pull = (r: Rack) => (r.count ? setAsk(r) : patch(r, { present: false }))
  const del = async (r: Rack) => { try { await api('DELETE', `/api/racks/${r.id}`); onChanged() } catch (e) { flash((e as Error).message) } }
  const addRack = async () => {
    try { await api('POST', `/api/cellars/${cellar.id}/racks`, { y_cm: Number(add.y), capacity: Number(add.cap) }); setAdd({ y: '', cap: '10' }); onChanged() }
    catch (e) { flash((e as Error).message) }
  }

  return (
    <div className="rack-editor">
      <p className="muted small">{cellar.width_cm}×{cellar.height_cm}×{cellar.depth_cm} cm{cellar.bottles_out_with_racks ? ` · ${cellar.bottles_out_with_racks} bottle(s) currently out with a pulled rack` : ''}</p>
      <div className="rack-table">
        <div className="rt-h">Rack</div><div className="rt-h">Height (cm)</div><div className="rt-h">Nominal</div><div className="rt-h">Bottles</div><div className="rt-h" />
        {racks.map(r => (
          <RackRow key={r.id} r={r} onPatch={b => patch(r, b)} onPull={() => pull(r)} onDelete={() => del(r)} />
        ))}
      </div>
      {ask && (
        <div className="ask-box">
          <b>{ask.name} holds {ask.count} bottle(s).</b> What happens to them?
          <div className="row-btns">
            <button className="btn" onClick={() => { void patch(ask, { present: false, bottles: 'with_rack' }); setAsk(null) }}>They come out with the rack</button>
            <button className="btn" onClick={() => { void patch(ask, { present: false, bottles: 'relocate' }); setAsk(null) }}>Re-home them in the cellar</button>
            <button className="btn" onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="row-btns">
        <input className="small-input" inputMode="decimal" placeholder="height cm" value={add.y} onChange={e => setAdd({ ...add, y: e.target.value })} />
        <input className="small-input" inputMode="numeric" placeholder="capacity" value={add.cap} onChange={e => setAdd({ ...add, cap: e.target.value })} />
        <button className="btn" disabled={!add.y} onClick={addRack}>+ Add rack</button>
      </div>
    </div>
  )
}

function RackRow({ r, onPatch, onPull, onDelete }: { r: Rack; onPatch: (b: Record<string, unknown>) => void; onPull: () => void; onDelete: () => void }) {
  const [v, setV] = useState({ name: r.name, y: String(r.y_cm), cap: String(r.capacity) })
  const floor = r.kind === 'floor'
  const dirty = v.name !== r.name || Number(v.y) !== r.y_cm || Number(v.cap) !== r.capacity
  return (
    <>
      <input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} className={r.present ? '' : 'dim'} />
      <input inputMode="decimal" value={v.y} disabled={floor} onChange={e => setV({ ...v, y: e.target.value })} />
      <input inputMode="numeric" value={v.cap} onChange={e => setV({ ...v, cap: e.target.value })} />
      <span className={`rt-count ${r.over_capacity ? 'over' : ''}`}>{r.present ? `${r.count}/${r.capacity}` : 'pulled out'}</span>
      <span className="row-btns">
        {dirty && <button className="btn primary" onClick={() => onPatch({ name: v.name, capacity: Number(v.cap), ...(floor ? {} : { y_cm: Number(v.y) }) })}>Save</button>}
        {!floor && (r.present
          ? <button className="btn" onClick={onPull}>Pull out</button>
          : <button className="btn" onClick={() => onPatch({ present: true })}>Put back</button>)}
        {!floor && !r.count && <button className="btn danger" onClick={onDelete}>✕</button>}
      </span>
    </>
  )
}
