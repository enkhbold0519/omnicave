import { useState } from 'react'
import { api, ApiError } from '../api'
import { useDraft } from '../hooks'
import type { Bottle, Cellar, Color, Wine } from '../types'
import { Field, Modal } from './ui'

const EMPTY: Wine = { name: '', producer: '', region: '', country: '', grape: '', color: 'red', vintage: new Date().getFullYear() - 3 }

interface Props { cellar: Cellar; bottle?: Bottle; onClose: () => void; onSaved: (b: Bottle) => void }

interface Pos { mode: 'auto' | 'rack'; rack_id: number; x: number; layer: 'front' | 'back'; level: number; orientation: 'lying' | 'standing' }

/** Manual add / edit. The add-form input is drafted to localStorage (survives restarts / network drops). */
export default function BottleForm({ cellar, bottle, onClose, onSaved }: Props) {
  const editing = !!bottle
  const [draft, setDraft, clearDraft] = useDraft<Wine>('bottle-add', EMPTY)
  const [local, setLocal] = useState<Wine>(bottle ? { ...bottle.wine } : EMPTY)
  const w = editing ? local : draft
  const setW = (patch: Partial<Wine>) => (editing ? setLocal({ ...local, ...patch }) : setDraft({ ...draft, ...patch }))
  const racks = cellar.racks.filter(r => r.present).sort((a, b) => b.y_cm - a.y_cm)
  const [pos, setPos] = useState<Pos>(() => bottle
    ? { mode: 'rack', rack_id: bottle.rack_id ?? racks[racks.length - 1].id, x: Math.round(bottle.x), layer: bottle.layer, level: bottle.level, orientation: bottle.orientation }
    : { mode: 'auto', rack_id: racks[0]?.id, x: 10, layer: 'front', level: 0, orientation: 'lying' })
  const [rec, setRec] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [warn, setWarn] = useState<string[]>([])

  const recommend = async () => {
    try {
      const r = await api<{ rack_id: number; x: number; z: number; level: number; reason: string; layer: 'front' | 'back' }>('POST', '/api/recommendations/storage', { cellar_id: cellar.id, color: w.color })
      setPos({ ...pos, mode: 'rack', rack_id: r.rack_id, x: Math.round(r.x), layer: r.layer, level: r.level }); setRec(r.reason)
    } catch (e) { setErr((e as Error).message) }
  }

  const save = async () => {
    setErr(null)
    const wine = { ...w, vintage: Number(w.vintage) || 0, drink_from: w.drink_from ? Number(w.drink_from) : undefined, drink_to: w.drink_to ? Number(w.drink_to) : undefined, base_price: w.base_price ? Number(w.base_price) : undefined }
    const rack = cellar.racks.find(r => r.id === pos.rack_id)
    const position = pos.mode === 'auto' ? undefined
      : { rack_id: pos.rack_id, x: pos.x, z: pos.layer === 'front' ? 6 : Math.round((rack?.depth_cm ?? 50) / 2), level: pos.level }
    try {
      const body = { wine, orientation: pos.orientation, ...(position || !editing ? { position } : {}) }
      const b = editing
        ? await api<Bottle>('PATCH', `/api/bottles/${bottle!.id}`, body)
        : await api<Bottle>('POST', '/api/bottles', { cellar_id: cellar.id, ...body })
      if (!editing) clearDraft()
      if (b.warnings?.length) setWarn(b.warnings)
      onSaved(b)
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Offline — your input is kept as a draft, try again when connected') }
  }

  return (
    <Modal title={editing ? 'Edit bottle' : 'Add bottle manually'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Wine name *"><input value={w.name} onChange={e => setW({ name: e.target.value })} /></Field>
        <Field label="Producer / winery *"><input value={w.producer} onChange={e => setW({ producer: e.target.value })} /></Field>
        <Field label="Region"><input value={w.region ?? ''} onChange={e => setW({ region: e.target.value })} /></Field>
        <Field label="Country"><input value={w.country ?? ''} onChange={e => setW({ country: e.target.value })} /></Field>
        <Field label="Grape(s)"><input value={w.grape ?? ''} onChange={e => setW({ grape: e.target.value })} /></Field>
        <Field label="Type">
          <select value={w.color} onChange={e => setW({ color: e.target.value as Color })}>
            <option value="red">Red</option><option value="white">White</option><option value="sparkling">Sparkling</option><option value="rose">Rosé</option>
          </select>
        </Field>
        <Field label="Vintage (0 = NV)"><input inputMode="numeric" value={w.vintage} onChange={e => setW({ vintage: Number(e.target.value) || 0 })} /></Field>
        <Field label="Purchase price (USD)"><input inputMode="numeric" value={w.base_price ?? ''} onChange={e => setW({ base_price: Number(e.target.value) || undefined })} /></Field>
        <Field label="Drink from"><input inputMode="numeric" value={w.drink_from ?? ''} onChange={e => setW({ drink_from: Number(e.target.value) || undefined })} /></Field>
        <Field label="Drink to"><input inputMode="numeric" value={w.drink_to ?? ''} onChange={e => setW({ drink_to: Number(e.target.value) || undefined })} /></Field>
      </div>

      <h3>Where in the cellar</h3>
      <div className="seg">
        <button className={pos.mode === 'auto' ? 'on' : ''} onClick={() => setPos({ ...pos, mode: 'auto' })}>{editing ? 'Keep current spot' : 'Best free spot (auto)'}</button>
        <button className={pos.mode === 'rack' ? 'on' : ''} onClick={() => setPos({ ...pos, mode: 'rack' })}>Choose rack & position</button>
      </div>
      {pos.mode === 'rack' && (
        <div className="form-grid">
          <Field label="Rack">
            <select value={pos.rack_id} onChange={e => setPos({ ...pos, rack_id: Number(e.target.value) })}>
              {racks.map(r => <option key={r.id} value={r.id}>{r.name} · {r.y_cm.toFixed(0)} cm · {r.count}/{r.capacity}</option>)}
            </select>
          </Field>
          <Field label={`From left wall: ${pos.x} cm`}>
            <input type="range" min={4} max={Math.floor(cellar.width_cm - 4)} value={pos.x} onChange={e => setPos({ ...pos, x: Number(e.target.value) })} />
          </Field>
          <Field label="Depth">
            <select value={pos.layer} onChange={e => setPos({ ...pos, layer: e.target.value as Pos['layer'] })}>
              <option value="front">Front row</option><option value="back">Back row</option>
            </select>
          </Field>
          <Field label="Stacking level">
            <select value={pos.level} onChange={e => setPos({ ...pos, level: Number(e.target.value) })}>
              <option value={0}>On the rack</option><option value={1}>Stacked (level 1)</option><option value={2}>Stacked (level 2)</option>
            </select>
          </Field>
          <Field label="Orientation">
            <select value={pos.orientation} onChange={e => setPos({ ...pos, orientation: e.target.value as Pos['orientation'] })}>
              <option value="lying">Lying</option><option value="standing">Standing (open / magnum)</option>
            </select>
          </Field>
        </div>
      )}
      <p className="muted small">Free mapping: racks have a nominal capacity but you can overfill them; stacked bottles need a bottle underneath.</p>
      {!editing && <button className="btn" onClick={recommend}>📍 Recommend storage location</button>}
      {rec && <p className="muted small">{rec}</p>}
      {warn.map((x, i) => <p key={i} className="warn-text">⚠ {x}</p>)}
      {err && <p className="error">{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={!w.name || !w.producer}>{editing ? 'Save' : 'Add to cellar'}</button>
      </div>
    </Modal>
  )
}
