import { useEffect, useState, type ReactNode } from 'react'
import { api, cachedGet } from '../api'
import { useStream } from '../useStream'
import type { Bottle, Color } from '../types'
import Debate from '../components/Debate'
import StreamOutput from '../components/StreamOutput'
import { LineChart } from '../components/Charts'
import Icon from '../components/Icon'
import { WindowBadge, money, pct } from '../components/ui'
import { wineKey } from './Inventory'
import { parseMessage } from '../sommelier/model'

const STYLE_NAME: Record<Color, string> = { red: 'Red', white: 'White', rose: 'Rosé', sparkling: 'Sparkling' }

interface Props {
  bottle: Bottle
  onClose: () => void
  onFind: (b: Bottle) => void
  onMove: (b: Bottle) => void
  onEdit: (b: Bottle) => void
  onChanged: () => void
  onAsk: (b: Bottle) => void
}

/** Wine Details as a full page (Android WineDetailsScreen): the essentials at a glance, the long parts folded. */
export default function WineDetails({ bottle, onClose, onFind, onMove, onEdit, onChanged, onAsk }: Props) {
  const w = bottle.wine
  const [bottles, setBottles] = useState<Bottle[]>([bottle])
  const [selId, setSelId] = useState(bottle.id)
  const [confirm, setConfirm] = useState<null | 'consumed' | 'removed'>(null)
  const [open, setOpen] = useState<null | 'debate' | 'pairing' | 'price'>(null)
  const [hist, setHist] = useState<{ date: string; price: number }[] | null>(null)
  const debate = useStream()
  const pairing = useStream()
  const sel = bottles.find(b => b.id === selId) ?? bottle

  // every bottle of this wine, in all cellars
  const loadBottles = async () => {
    try {
      const r = await cachedGet<Bottle[]>(`/api/bottles?${new URLSearchParams({ q: w.name, field: 'name' })}`)
      const same = r.data.filter(b => wineKey(b) === wineKey(bottle))
      setBottles(same.length ? same : [bottle])
    } catch { setBottles([bottle]) }
  }
  useEffect(() => {
    setSelId(bottle.id); setOpen(null); setHist(null); setConfirm(null); pairing.abort()
    void loadBottles()
    // paper FR9: selecting a wine on the door starts the sommeliers' discussion
    void debate.run('/api/ai/table', { topic: { kind: 'wine', bottle_id: bottle.id } })
  }, [bottle.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: 'debate' | 'pairing' | 'price') => {
    const next = open === k ? null : k
    setOpen(next)
    if (next === 'pairing' && !pairing.text && !pairing.running) void pairing.run('/api/ai/pairing/wine', { bottle_id: sel.id })
    if (next === 'price' && !hist) void api<{ history: { date: string; price: number }[] }>('GET', `/api/bottles/${sel.id}/price-history`)
      .then(r => setHist(r.history)).catch(() => setHist([]))
  }

  const remove = async (reason: 'consumed' | 'removed') => {
    await api('DELETE', `/api/bottles/${sel.id}?reason=${reason}`)
    setConfirm(null); onChanged()
    const rest = bottles.filter(b => b.id !== sel.id)
    if (!rest.length) { onClose(); return }
    setBottles(rest); setSelId(rest[0].id)
  }

  const z = sel.zone?.latest
  const lastTurn = debate.turns[debate.turns.length - 1]
  const multiCellar = new Set(bottles.map(b => b.cellar_id)).size > 1

  return (
    <div className="view detail-page">
      <div className="page-head">
        <button className="icon-btn" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
      </div>

      <div className="detail-hero">
        <span className="t-overline">{w.vintage || 'NV'} · {STYLE_NAME[w.color]}</span>
        <h1>{w.name}</h1>
        <span className="muted">{[w.producer, [w.region, w.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
        <div className="detail-window">
          <WindowBadge s={sel.window_status} />
          {w.drink_from && w.drink_to && <span className="fg-2">Best {w.drink_from}–{w.drink_to}</span>}
        </div>
      </div>

      <section>
        <h3>In your cellars · {bottles.length}</h3>
        <div className="rows">
          {bottles.map(b => (
            <div key={b.id} className={`loc-row ${b.id === selId ? 'on' : ''}`}>
              <button className="loc-main" onClick={() => { setSelId(b.id); setConfirm(null) }} aria-pressed={b.id === selId}>
                <span className="loc-radio" />
                <span className="br-main">
                  <span className="br-title">{b.location.replace(/ · (front|back)$/, '')}</span>
                  <span className="br-sub">{[multiCellar || b.cellar_id !== bottle.cellar_id ? b.cellar_name : null, b.level ? `stacked, level ${b.level}` : null, b.layer === 'back' ? 'back row' : null, b.source === 'vision' && b.confidence != null && b.confidence < 0.8 ? 'position uncertain' : null].filter(Boolean).join(' · ') || 'Front row'}</span>
                </span>
              </button>
              <button className="btn slim" onClick={() => onFind(b)}>Find</button>
            </div>
          ))}
        </div>
        <div className="row-btns bottle-actions">
          {confirm
            ? <>
                <span className="fg-2">{confirm === 'consumed' ? 'Mark this bottle as opened?' : 'Remove this bottle from the inventory?'}</span>
                <button className="btn danger" onClick={() => remove(confirm)}>{confirm === 'consumed' ? 'Opened' : 'Remove'}</button>
                <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
              </>
            : <>
                <button className="btn" onClick={() => onMove(sel)}>Move</button>
                <button className="btn" onClick={() => onEdit(sel)}>Edit</button>
                <button className="btn" onClick={() => setConfirm('consumed')}>Opened</button>
                <button className="btn" onClick={() => setConfirm('removed')}>Remove</button>
              </>}
        </div>
      </section>

      <section>
        <h3>At a glance</h3>
        <div className="glance">
          <Fact label="Grape" value={w.grape || '—'} />
          <Fact label="Region" value={w.region || '—'} />
          <Fact label="Value" value={money(sel.market.price)}
                extra={<span className={sel.market.change_12m >= 0 ? 'up' : 'down'}>{pct(sel.market.change_12m)} this year</span>} />
          <Fact label="Its shelf now" value={z ? `${z.temp.toFixed(1)} °C · ${Math.round(z.hum)} %` : 'No reading'} />
        </div>
      </section>

      <Fold title="Sommeliers" open={open === 'debate'} onToggle={() => toggle('debate')}
            summary={lastTurn
              ? <span className="fold-preview"><b>{lastTurn.name}:</b> {parseMessage(lastTurn.text).body}</span>
              : <span className="muted">{debate.running ? 'Tasting…' : 'Ask the sommeliers about this wine'}</span>}>
        <Debate turns={debate.turns} running={debate.running} error={debate.error} />
        <button className="btn" onClick={() => onAsk(sel)}>Ask the sommeliers</button>
      </Fold>

      <Fold title="Food pairing" open={open === 'pairing'} onToggle={() => toggle('pairing')} summary={<span className="muted">Dishes and recipes for this wine</span>}>
        <StreamOutput s={pairing} />
      </Fold>

      <Fold title="Price history" open={open === 'price'} onToggle={() => toggle('price')}
            summary={<span className="muted">{money(sel.market.price)} today</span>}>
        {hist === null ? <p className="muted">Loading…</p>
          : hist.length > 1
            ? <><LineChart values={hist.map(h => h.price)} width={960} height={220} fill labels={[hist[0].date, hist[hist.length - 1].date]} />
                <p className="muted small">Last 24 months{sel.market.source === 'simulated' ? ' · simulated prices' : ''}</p></>
            : <p className="muted">No price history yet.</p>}
      </Fold>
    </div>
  )
}

function Fact({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <div className="fact">
      <span className="t-overline">{label}</span>
      <span className="fact-value">{value}</span>
      {extra && <span className="small">{extra}</span>}
    </div>
  )
}

function Fold({ title, summary, open, onToggle, children }: { title: string; summary: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`fold ${open ? 'open' : ''}`}>
      <button className="fold-head" onClick={onToggle} aria-expanded={open}>
        <span className="fold-text"><span className="t-heading">{title}</span>{!open && summary}</span>
        <span className="fold-chev"><Icon name="chevron" size={24} /></span>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  )
}
