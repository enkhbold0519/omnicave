import type { useStream } from '../useStream'
import { BottleRow, money } from './ui'
import type { Bottle } from '../types'

export default function StreamOutput({ s, onPick }: { s: ReturnType<typeof useStream>; onPick?: (b: Bottle) => void }) {
  if (!s.running && !s.text && !s.items.length && !s.error) return null
  return (
    <div className="stream-out">
      {s.items.length > 0 && (
        <div className="list">
          <div className="list-h">From your cellar</div>
          {s.items.map(b => <BottleRow key={b.id} b={b} onClick={() => onPick?.(b)} right={<span className="muted">{money(b.market.price)}</span>} />)}
        </div>
      )}
      {s.purchase.length > 0 && (
        <div className="list">
          <div className="list-h">Worth buying (external catalog)</div>
          {s.purchase.map((w, i) => (
            <div key={i} className="bottle-row static">
              <span className="dot" style={{ background: `var(--${w.color})` }} />
              <span className="br-main"><span className="br-title">{w.producer} {w.name} {w.vintage || 'NV'}</span>
                <span className="br-sub">{w.region} · {w.grape}</span></span>
              <span className="muted">{money(w.market.price)}</span>
            </div>
          ))}
        </div>
      )}
      {(s.text || s.running) && <div className="ai-text">{s.text}{s.running && <span className="cursor">▍</span>}</div>}
      {s.error && <div className="error">{s.error}</div>}
      {s.firstTokenMs !== null && <div className="muted tiny">first token {s.firstTokenMs} ms</div>}
    </div>
  )
}
