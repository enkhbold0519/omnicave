import type { ReactNode } from 'react'
import Icon from './Icon'

/* Shared building blocks for the Profile and settings pages (Android settings look). */

export function PageHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="page-head">
      <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
      <h2>{title}</h2>
    </div>
  )
}

/** Label on the left, current value and a chevron on the right (Android SettingRow). */
export function Row({ label, value, leading, kind = 'open', onClick }: { label: string; value?: string; leading?: ReactNode; kind?: 'open' | 'pick'; onClick: () => void }) {
  return (
    <button className="set-row" onClick={onClick} aria-label={value ? `${label}: ${value}` : label}>
      <span className="set-label">{label}</span>
      {leading}
      <span className="set-value">{value}</span>
      <span className={`set-chev ${kind}`}><Icon name="chevron" size={24} /></span>
    </button>
  )
}

/** Tap-to-select list shown right on the page (no pop-up). */
export function Choices({ options, selected, onPick }: { options: { id: string; title: string; detail?: string; leading?: ReactNode }[]; selected: string; onPick: (id: string) => void }) {
  return (
    <div className="rows">
      {options.map(o => (
        <button key={o.id} className={`pick-row ${o.id === selected ? 'on' : ''}`} onClick={() => onPick(o.id)} role="radio" aria-checked={o.id === selected}>
          {o.leading}
          <span className="br-main"><span className="br-title">{o.title}</span>{o.detail && <span className="br-sub">{o.detail}</span>}</span>
          <span className="pick-check">{o.id === selected ? '✓' : ''}</span>
        </button>
      ))}
    </div>
  )
}

export function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
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

export function Info({ label, value }: { label: string; value: string }) {
  return <div className="set-row static"><span className="set-label">{label}</span><span className="set-value">{value}</span></div>
}
