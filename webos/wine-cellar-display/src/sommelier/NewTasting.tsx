import { useEffect, useMemo, useState } from 'react'
import { cachedGet } from '../api'
import type { Bottle, Persona } from '../types'
import Icon from '../components/Icon'
import { Modal, colorVar } from '../components/ui'
import { groupByWine } from '../views/Inventory'
import { TABLE_MAX, TABLE_MIN, type Intent, type Topic } from './model'

export function Avatar({ p, size = 56 }: { p: { name: string; color: string }; size?: number }) {
  const ini = p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return <span className="p-avatar" style={{ background: p.color, width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">{ini}</span>
}

const HEAD: Record<'wine' | Intent, { title: string; field?: string; placeholder?: string }> = {
  wine: { title: 'Discuss a wine' },
  tonight: { title: 'What to open tonight' },
  pairing: { title: 'Pair with a meal', field: 'Your meal', placeholder: 'e.g. Roast lamb with rosemary' },
  open: { title: 'Ask anything', field: 'Your question', placeholder: 'e.g. Which of my wines will age the longest?' },
}

/** Android NewTastingScreen: the topic, then who sits at the table (2–5). */
export function NewTasting({ kind, bottle, personas, onBack, onStart, onEditPersonas }: {
  kind: 'wine' | Intent; bottle?: Bottle; personas: Persona[]; onBack: () => void; onStart: (t: Topic, seats: Persona[]) => void; onEditPersonas: () => void
}) {
  const [wine, setWine] = useState<Bottle | null>(bottle ?? null)
  const [text, setText] = useState('')
  const [seats, setSeats] = useState<string[]>(() => personas.slice(0, 3).map(p => p.id))
  const [picking, setPicking] = useState(false)
  useEffect(() => { if (!seats.length && personas.length) setSeats(personas.slice(0, 3).map(p => p.id)) }, [personas]) // eslint-disable-line react-hooks/exhaustive-deps

  const h = HEAD[kind]
  const toggle = (id: string) => setSeats(s => s.includes(id) ? s.filter(x => x !== id) : s.length < TABLE_MAX ? [...s, id] : s)
  const ready = seats.length >= TABLE_MIN && (kind === 'wine' ? !!wine : kind === 'tonight' || text.trim().length > 1)

  const start = () => {
    const topic: Topic = kind === 'wine'
      ? { kind: 'wine', bottle_id: wine!.id, title: `${wine!.wine.name} ${wine!.wine.vintage || 'NV'}` }
      : { kind: 'question', intent: kind, text: text.trim(), title: kind === 'tonight' ? 'What to open tonight' : text.trim() }
    onStart(topic, personas.filter(p => seats.includes(p.id)))
  }

  return (
    <div className="view sommelier">
      <div className="page-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <h2>{h.title}</h2>
      </div>

      {kind === 'wine' && (
        <section>
          <h3>Wine</h3>
          <button className="pick-wine" onClick={() => setPicking(true)}>
            {wine
              ? <><span className="dot big" style={{ background: colorVar(wine.wine.color) }} />
                  <span className="br-main"><span className="br-title">{wine.wine.name}</span><span className="br-sub">{wine.wine.vintage || 'NV'} · {wine.wine.producer}</span></span></>
              : <span className="br-main muted">Choose a wine from your cellar</span>}
            <span className="set-chev pick"><Icon name="chevron" size={24} /></span>
          </button>
        </section>
      )}
      {h.field && (
        <section>
          <h3>{h.field}</h3>
          <textarea value={text} placeholder={h.placeholder} maxLength={300} onChange={e => setText(e.target.value)} />
        </section>
      )}

      <section>
        <div className="section-head">
          <h3>At the table · {seats.length} of {TABLE_MAX}</h3>
          <button className="link-btn" onClick={onEditPersonas}>Add or edit</button>
        </div>
        <div className="persona-strip">
          {personas.map(p => {
            const on = seats.includes(p.id)
            return (
              <button key={p.id} className={`persona-chip ${on ? 'on' : ''}`} onClick={() => toggle(p.id)} role="checkbox" aria-checked={on}>
                <Avatar p={p} size={88} />
                <span className="pc-name">{p.name.split(' ')[0]}</span>
                <span className="pc-title">{p.title}</span>
              </button>
            )
          })}
        </div>
        {seats.length < TABLE_MIN && <p className="muted small">Choose at least {TABLE_MIN} sommeliers.</p>}
      </section>

      <button className="btn primary big start-btn" disabled={!ready} onClick={start}>Start the tasting</button>

      {picking && <WinePicker onClose={() => setPicking(false)} onPick={b => { setWine(b); setPicking(false) }} />}
    </div>
  )
}

function WinePicker({ onPick, onClose }: { onPick: (b: Bottle) => void; onClose: () => void }) {
  const [all, setAll] = useState<Bottle[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { cachedGet<Bottle[]>('/api/bottles?q=').then(r => setAll(r.data)).catch(() => setAll([])) }, [])
  const groups = useMemo(() => groupByWine(all.filter(b => `${b.wine.name} ${b.wine.producer} ${b.wine.vintage}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.first.wine.name.localeCompare(b.first.wine.name)), [all, q])
  return (
    <Modal title="Choose a wine" onClose={onClose}>
      <input value={q} placeholder="Search" onChange={e => setQ(e.target.value)} aria-label="Search wines" />
      <div className="rows picker-list">
        {groups.map(g => (
          <button key={g.key} className="pick-row" onClick={() => onPick(g.first)}>
            <span className="dot big" style={{ background: colorVar(g.first.wine.color) }} />
            <span className="br-main"><span className="br-title">{g.first.wine.name}</span><span className="br-sub">{g.first.wine.vintage || 'NV'} · {g.first.wine.producer}</span></span>
            <span className="muted">{g.bottles.length}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
