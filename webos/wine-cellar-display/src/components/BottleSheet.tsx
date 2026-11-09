import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStream } from '../useStream'
import type { Bottle } from '../types'
import Debate from './Debate'
import StreamOutput from './StreamOutput'
import { LineChart } from './Charts'
import { WindowBadge, colorVar, money, pct } from './ui'

interface Props { bottle: Bottle; onClose: () => void; onEdit: () => void; onMove: () => void; onChanged: () => void }

export default function BottleSheet({ bottle: b, onClose, onEdit, onMove, onChanged }: Props) {
  const [tab, setTab] = useState<'debate' | 'pairing' | 'price'>('debate')
  const debate = useStream()
  const pairing = useStream()
  const [hist, setHist] = useState<{ date: string; price: number }[]>([])
  const [confirm, setConfirm] = useState<null | 'consumed' | 'removed'>(null)
  const w = b.wine

  // FR9: selecting a bottle on the touch display triggers the multi-agent dialogue
  useEffect(() => { setTab('debate'); void debate.run('/api/ai/dialogue', { bottle_id: b.id }) }, [b.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'pairing' && !pairing.text && !pairing.running) void pairing.run('/api/ai/pairing/wine', { bottle_id: b.id })
    if (tab === 'price') void api<{ history: { date: string; price: number }[] }>('GET', `/api/bottles/${b.id}/price-history`).then(r => setHist(r.history)).catch(() => setHist([]))
  }, [tab, b.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (reason: 'consumed' | 'removed') => {
    await api('DELETE', `/api/bottles/${b.id}?reason=${reason}`)
    onChanged(); onClose()
  }
  const z = b.zone?.latest

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div className="sheet-title">
          <span className="dot big" style={{ background: colorVar(w.color) }} />
          <div>
            <div className="wine-name">{w.name}</div>
            <div className="muted">{w.producer} · {w.vintage || 'NV'} · {w.region}, {w.country}</div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="facts">
        <div><span className="muted small">Location</span><b>{b.rack_name ?? 'Free-standing'}{b.level ? ` · stacked L${b.level}` : ''}</b>
          <span className="muted tiny">x {b.x.toFixed(0)} · y {b.y.toFixed(0)} · z {b.z.toFixed(0)} cm · {b.layer}</span></div>
        <div><span className="muted small">Zone now</span><b>{z ? `${z.temp.toFixed(1)}°C · ${Math.round(z.hum)}%` : 'no data'}</b></div>
        <div><span className="muted small">Window</span><b>{w.drink_from}–{w.drink_to}</b> <WindowBadge s={b.window_status} /></div>
        <div><span className="muted small">Value ({b.market.source})</span><b>{money(b.market.price)}</b> <span className={b.market.change_12m >= 0 ? 'up' : 'down'}>{pct(b.market.change_12m)}</span></div>
        <div><span className="muted small">Grape</span><b>{w.grape}</b></div>
        <div><span className="muted small">ID</span><b className="mono">{b.serial}</b> <span className="muted tiny">{b.source}{b.confidence ? ` ${Math.round(b.confidence * 100)}%` : ''}</span></div>
      </div>
      <div className="seg">
        <button className={tab === 'debate' ? 'on' : ''} onClick={() => setTab('debate')}>Critic debate</button>
        <button className={tab === 'pairing' ? 'on' : ''} onClick={() => setTab('pairing')}>Food pairing</button>
        <button className={tab === 'price' ? 'on' : ''} onClick={() => setTab('price')}>Price trend</button>
      </div>
      <div className="sheet-body">
        {tab === 'debate' && <Debate turns={debate.turns} running={debate.running} error={debate.error} firstTokenMs={debate.firstTokenMs} />}
        {tab === 'pairing' && <StreamOutput s={pairing} />}
        {tab === 'price' && (hist.length > 1
          ? <div><LineChart values={hist.map(h => h.price)} width={960} height={220} fill labels={[hist[0].date, hist[hist.length - 1].date]} />
              <p className="muted small">24-month price history · source: {b.market.source}</p></div>
          : <p className="muted">Loading…</p>)}
      </div>
      <div className="sheet-actions">
        {tab === 'debate' && <button className="btn" onClick={() => debate.run('/api/ai/dialogue', { bottle_id: b.id })} disabled={debate.running}>↻ New debate</button>}
        <button className="btn" onClick={onMove}>✥ Move</button>
        <button className="btn" onClick={onEdit}>Edit info</button>
        {confirm
          ? <>
              <span className="muted">{confirm === 'consumed' ? 'Mark as opened?' : 'Remove from inventory?'}</span>
              <button className="btn danger" onClick={() => remove(confirm)}>Confirm</button>
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            </>
          : <>
              <button className="btn" onClick={() => setConfirm('consumed')}>🍷 Opened</button>
              <button className="btn" onClick={() => setConfirm('removed')}>Remove</button>
            </>}
      </div>
    </div>
  )
}
