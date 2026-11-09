import { usePoll } from '../hooks'
import { LineChart } from '../components/Charts'
import { money, pct } from '../components/ui'

interface Summary {
  total: number; change_12m: number; count: number; source: string
  history: { date: string; value: number }[]
  bottles: { bottle_id: number; label: string; price: number; change_12m: number; cellar: string }[]
}

export default function Value({ onPick }: { onPick: (id: number) => void }) {
  const { data: m, stale } = usePoll<Summary>('/api/market/summary', 60_000)
  if (!m) return <div className="view muted">Loading market data…</div>
  return (
    <div className="view">
      <h2 className="view-title">Collection value</h2>
      <div className="card value-hero">
        <div>
          <div className="muted small">{m.count} bottles · all cellars · {m.source}{stale ? ' · cached' : ''}</div>
          <div className="value-big">{money(m.total)}</div>
          <div className={m.change_12m >= 0 ? 'up' : 'down'}>{pct(m.change_12m)} in 12 months</div>
        </div>
        <LineChart values={m.history.map(h => h.value)} width={930} height={240} fill
                   labels={m.history.length ? [m.history[0].date, m.history[m.history.length - 1].date] : undefined} />
      </div>
      {m.source === 'simulated' && <p className="muted small">Prices are simulated. Set WINE_SEARCHER_API_KEY in backend/.env to use real market data.</p>}
      <div className="list scroll">
        {m.bottles.map(b => (
          <button key={b.bottle_id} className="bottle-row" onClick={() => onPick(b.bottle_id)}>
            <span className="br-main"><span className="br-title">{b.label}</span><span className="br-sub">{b.cellar}</span></span>
            <span className="value-col"><b>{money(b.price)}</b><span className={b.change_12m >= 0 ? 'up' : 'down'}>{pct(b.change_12m)}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}
