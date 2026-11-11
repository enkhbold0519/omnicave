import { useEffect, useMemo, useState } from 'react'
import { cachedGet } from '../api'
import { usePoll } from '../hooks'
import type { Bottle, Color } from '../types'
import { LineChart } from '../components/Charts'
import { colorVar, money, pct } from '../components/ui'

interface Summary {
  total: number; change_12m: number; count: number; source: string
  history: { date: string; value: number }[]
  bottles: { bottle_id: number; label: string; price: number; change_12m: number; cellar: string }[]
}
type Row = Summary['bottles'][number] & { color?: Color }

const STYLE: [Color, string][] = [['red', 'Red'], ['white', 'White'], ['rose', 'Rosé'], ['sparkling', 'Sparkling']]
const RANGES = [[12, '1 year'], [24, '2 years']] as const

/** Collection value (paper FR7): total and trend first, then what drives it. */
export default function Value({ onPick }: { onPick: (id: number) => void }) {
  const { data: m, stale } = usePoll<Summary>('/api/market/summary', 5 * 60_000)
  const [colors, setColors] = useState<Record<number, Color>>({})
  const [months, setMonths] = useState<number>(12)
  const [showAll, setShowAll] = useState(false)

  // the market summary has no wine style; take it from the inventory for the breakdown
  useEffect(() => {
    cachedGet<Bottle[]>('/api/bottles?q=').then(r => setColors(Object.fromEntries(r.data.map(b => [b.id, b.wine.color])))).catch(() => {})
  }, [m?.count])

  const rows: Row[] = useMemo(() => (m?.bottles ?? []).map(b => ({ ...b, color: colors[b.bottle_id] })), [m, colors])
  if (!m) return <div className="view muted">Loading market data…</div>

  const hist = m.history.slice(-(months + 1))   // monthly points: a year needs 13 (this month and the same month last year)
  const change = hist.length > 1 ? (hist[hist.length - 1].value - hist[0].value) / hist[0].value * 100 : m.change_12m
  const byStyle = STYLE.map(([c, l]) => ({ c, l, v: rows.filter(r => r.color === c).reduce((s, r) => s + r.price, 0) })).filter(x => x.v > 0)
  const cellars = [...new Set(rows.map(r => r.cellar))]
  const movers = [...rows].sort((a, b) => b.change_12m - a.change_12m)
  const up = movers[0], down = movers[movers.length - 1]
  const list = showAll ? rows : rows.slice(0, 5)

  return (
    <div className="view value">
      <div className="title-row">
        <div>
          <h2>Value</h2>
          <div className="muted small">{m.count} bottles{cellars.length > 1 ? ` · ${cellars.length} cellars` : ''}{stale ? ' · offline' : ''}</div>
        </div>
        <div className="seg mini">
          {RANGES.map(([n, l]) => <button key={n} className={months === n ? 'on' : ''} onClick={() => setMonths(n)}>{l}</button>)}
        </div>
      </div>

      <div className="value-hero">
        <span className="value-big">{money(m.total)}</span>
        <span className={`value-change ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? '▲' : '▼'} {pct(change)} in {months === 12 ? 'a year' : 'two years'}</span>
        {hist.length > 1 && <LineChart values={hist.map(h => h.value)} width={990} height={220} fill labels={[hist[0].date, hist[hist.length - 1].date]} />}
      </div>

      {byStyle.length > 0 && (
        <section>
          <h3>By style</h3>
          <div className="style-bar" role="img" aria-label={byStyle.map(s => `${s.l} ${Math.round(s.v / m.total * 100)}%`).join(', ')}>
            {byStyle.map(s => <span key={s.c} style={{ flex: s.v, background: colorVar(s.c) }} />)}
          </div>
          <div className="style-legend">
            {byStyle.map(s => <span key={s.c}><i className="dot" style={{ background: colorVar(s.c) }} />{s.l} <b>{money(s.v)}</b></span>)}
          </div>
        </section>
      )}

      {rows.length > 1 && up && down && up.bottle_id !== down.bottle_id && (
        <section>
          <h3>This year</h3>
          <div className="movers">
            <button className="mover" onClick={() => onPick(up.bottle_id)}>
              <span className="t-overline">Rose most</span><span className="br-title">{up.label}</span><span className="up">{pct(up.change_12m)}</span>
            </button>
            <button className="mover" onClick={() => onPick(down.bottle_id)}>
              <span className="t-overline">{down.change_12m < 0 ? 'Fell most' : 'Rose least'}</span><span className="br-title">{down.label}</span>
              <span className={down.change_12m < 0 ? 'down' : 'muted'}>{pct(down.change_12m)}</span>
            </button>
          </div>
        </section>
      )}

      <section>
        <h3>Most valuable</h3>
        <div className="rows">
          {list.map(b => (
            <button key={b.bottle_id} className="wine-row compact" onClick={() => onPick(b.bottle_id)}>
              <span className="tint-bar" style={{ background: b.color ? colorVar(b.color) : 'var(--hairline)' }} />
              <span className="br-main"><span className="br-title">{b.label}</span>{cellars.length > 1 && <span className="br-sub">{b.cellar}</span>}</span>
              <span className="value-col"><span>{money(b.price)}</span><span className={`small ${b.change_12m >= 0 ? 'up' : 'down'}`}>{pct(b.change_12m)}</span></span>
            </button>
          ))}
        </div>
        {rows.length > 5 && <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button>}
      </section>

      {m.source === 'simulated' && <p className="muted small">Prices are estimates for this prototype, not live market data.</p>}
    </div>
  )
}
