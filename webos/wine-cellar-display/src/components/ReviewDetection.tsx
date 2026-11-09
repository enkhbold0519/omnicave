import { useState } from 'react'
import { api } from '../api'
import type { Bottle, Detection, Wine } from '../types'
import { Field, Modal } from './ui'

/** FR2: user reviews & corrects AI-extracted label data before registration. */
export default function ReviewDetection({ d, onClose, onConfirmed }: { d: Detection; onClose: () => void; onConfirmed: (b: Bottle) => void }) {
  const p = d.payload
  const [w, setW] = useState<Wine>({ color: 'red', vintage: 0, ...p.wine } as Wine)
  const [err, setErr] = useState<string | null>(null)
  const conf = Math.round(p.confidence * 100)
  const confirm = async () => {
    try {
      const r = await api<{ bottle?: Bottle; duplicate?: boolean }>('POST', `/api/detections/${d.id}/confirm`, { wine: w })
      if (r.bottle) onConfirmed(r.bottle)
      else onClose()
    } catch (e) { setErr((e as Error).message) }
  }
  const reject = async () => { await api('POST', `/api/detections/${d.id}/reject`); onClose() }
  return (
    <Modal title="Camera detected a new bottle" onClose={onClose}>
      <div className="detect-meta">
        <span className={`badge ${conf >= 85 ? 'env-ok' : 'env-alert'}`}>Label OCR confidence {conf}%</span>
        <span className="badge">{p.rack_name} · {p.x.toFixed(0)} cm from left · {p.z < 20 ? 'front' : 'back'}{p.stacked ? ` · stacked L${p.level}` : ''}</span>
        <span className="badge mono">ID {p.tag}</span>
      </div>
      {p.note && <p className="warn-text">⚠ {p.note}</p>}
      <div className="form-grid">
        <Field label="Wine name"><input value={w.name} onChange={e => setW({ ...w, name: e.target.value })} /></Field>
        <Field label="Producer"><input value={w.producer} onChange={e => setW({ ...w, producer: e.target.value })} /></Field>
        <Field label="Vintage (0 = NV)"><input inputMode="numeric" value={w.vintage} onChange={e => setW({ ...w, vintage: Number(e.target.value) || 0 })} /></Field>
        <Field label="Region"><input value={w.region ?? ''} onChange={e => setW({ ...w, region: e.target.value })} /></Field>
        <Field label="Grape"><input value={w.grape ?? ''} onChange={e => setW({ ...w, grape: e.target.value })} /></Field>
        <Field label="Type">
          <select value={w.color} onChange={e => setW({ ...w, color: e.target.value as Wine['color'] })}>
            <option value="red">Red</option><option value="white">White</option><option value="sparkling">Sparkling</option><option value="rose">Rosé</option>
          </select>
        </Field>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={reject}>Not a bottle / discard</button>
        <button className="btn primary" onClick={confirm} disabled={!w.name || !w.producer}>Confirm & register</button>
      </div>
    </Modal>
  )
}
