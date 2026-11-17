import type { ReactNode } from 'react'
import type { Bottle, Color } from '../types'

export const colorVar = (c: Color) => `var(--${c})`
export const label = (b: Bottle) =>
  `${b.wine.name.startsWith(b.wine.producer) ? '' : b.wine.producer + ' '}${b.wine.name} ${b.wine.vintage || 'NV'}`
export const money = (v: number) => '$' + Math.round(v).toLocaleString('en-US')
export const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function WindowBadge({ s }: { s: Bottle['window_status'] }) {
  const t = { ready: 'Ready', young: 'Hold', 'past-peak': 'Past peak' }[s]  // same words as the Android app
  return <span className={`badge win-${s}`}>{t}</span>
}

export function BottleRow({ b, onClick, right }: { b: Bottle; onClick?: () => void; right?: ReactNode }) {
  return (
    <button className="bottle-row" onClick={onClick}>
      <span className="dot" style={{ background: colorVar(b.wine.color) }} />
      <span className="br-main">
        <span className="br-title">{label(b)}</span>
        <span className="br-sub">{b.wine.region} · {b.wine.grape} · {b.cellar_name ? `${b.cellar_name} · ` : ''}{b.location}</span>
      </span>
      {right ?? <WindowBadge s={b.window_status} />}
    </button>
  )
}

export function Field({ label: l, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{l}</span>{children}</label>
}
