import { useEffect, useMemo, useState } from 'react'
import { cachedGet } from '../api'
import { useDraft } from '../hooks'
import type { Bottle, Color } from '../types'
import { colorVar, WindowBadge } from '../components/ui'

const STYLES: [Color | 'all', string][] = [['all', 'All'], ['red', 'Red'], ['white', 'White'], ['rose', 'Rosé'], ['sparkling', 'Sparkling']]
const SORTS = { name: 'Name', vintage: 'Vintage', recent: 'Recently added' } as const
type Sort = keyof typeof SORTS
const STYLE_NAME: Record<Color, string> = { red: 'Red', white: 'White', rose: 'Rosé', sparkling: 'Sparkling' }

/** One wine with all its bottles (same wine + vintage), like the Android inventory list. */
export interface WineGroup { key: string; bottles: Bottle[]; first: Bottle }

export const wineKey = (b: Bottle) => b.wine.id != null ? `w${b.wine.id}` : `${b.wine.producer}|${b.wine.name}|${b.wine.vintage}`

export function groupByWine(bottles: Bottle[]): WineGroup[] {
  const map = new Map<string, Bottle[]>()
  for (const b of bottles) {
    const k = wineKey(b)
    map.set(k, [...(map.get(k) ?? []), b])
  }
  return [...map.entries()].map(([key, bs]) => ({ key, bottles: bs, first: bs[0] }))
}

interface Props { cellarId: number | null; multiCellar: boolean; onOpen: (b: Bottle) => void }

export default function Inventory({ cellarId, multiCellar, onOpen }: Props) {
  const [f, setF] = useDraft('inventory', { q: '', style: 'all' as Color | 'all', ready: false, sort: 'name' as Sort, everywhere: false })
  const [all, setAll] = useState<Bottle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [stale, setStale] = useState(false)
  const scopeAll = f.everywhere && multiCellar

  // search on the server (name, winery, region, vintage, grape), filter and group here
  useEffect(() => {
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ q: f.q.trim(), ...(scopeAll || !cellarId ? {} : { cellar_id: String(cellarId) }) })
      try { const r = await cachedGet<Bottle[]>(`/api/bottles?${qs}`); setAll(r.data); setStale(r.stale) }
      catch { setAll([]) }
      setLoaded(true)
    }, 200)
    return () => clearTimeout(t)
  }, [f.q, scopeAll, cellarId])

  const groups = useMemo(() => {
    const gs = groupByWine(all.filter(b => (f.style === 'all' || b.wine.color === f.style) && (!f.ready || b.window_status === 'ready')))
    const by = {
      name: (a: WineGroup, b: WineGroup) => a.first.wine.name.localeCompare(b.first.wine.name),
      vintage: (a: WineGroup, b: WineGroup) => (b.first.wine.vintage || 0) - (a.first.wine.vintage || 0),
      recent: (a: WineGroup, b: WineGroup) => Math.max(...b.bottles.map(x => +new Date(x.added_at))) - Math.max(...a.bottles.map(x => +new Date(x.added_at))),
    }[f.sort]
    return gs.sort(by)
  }, [all, f.style, f.ready, f.sort])

  const bottleCount = groups.reduce((n, g) => n + g.bottles.length, 0)
  const filtered = f.q || f.style !== 'all' || f.ready
  const nextSort = (Object.keys(SORTS) as Sort[])[((Object.keys(SORTS) as Sort[]).indexOf(f.sort) + 1) % 3]

  return (
    <div className="view inventory">
      <div className="title-row">
        <div>
          <h2>Inventory</h2>
          <div className="muted small">
            {bottleCount} {bottleCount === 1 ? 'bottle' : 'bottles'} · {groups.length} {groups.length === 1 ? 'wine' : 'wines'}
            {stale ? ' · offline' : ''}
          </div>
        </div>
        {multiCellar && (
          <div className="seg mini">
            <button className={!f.everywhere ? 'on' : ''} onClick={() => setF({ ...f, everywhere: false })}>This cellar</button>
            <button className={f.everywhere ? 'on' : ''} onClick={() => setF({ ...f, everywhere: true })}>All cellars</button>
          </div>
        )}
      </div>

      <input className="search-input" type="search" placeholder="Wine, winery, region, vintage, grape" value={f.q}
             onChange={e => setF({ ...f, q: e.target.value })} aria-label="Search inventory" />

      <div className="chip-row">
        {STYLES.map(([k, l]) => <button key={k} className={`pill ${f.style === k ? 'on' : ''}`} onClick={() => setF({ ...f, style: k })}>{l}</button>)}
        <span className="chip-sep" />
        <button className={`pill ${f.ready ? 'on' : ''}`} role="checkbox" aria-checked={f.ready} onClick={() => setF({ ...f, ready: !f.ready })}>Ready to drink</button>
        <button className="pill" onClick={() => setF({ ...f, sort: nextSort })} aria-label={`Sort by ${SORTS[f.sort]}. Tap to change.`}>Sort: {SORTS[f.sort]}</button>
      </div>

      <div className="list scroll">
        {groups.map(g => <WineRow key={g.key} g={g} showCellar={scopeAll} onClick={() => onOpen(g.first)} />)}
        {loaded && groups.length === 0 && (
          <div className="empty">
            <div className="t-title">{filtered ? 'No wines match' : 'No bottles yet'}</div>
            {filtered
              ? <button className="link-btn" onClick={() => setF({ ...f, q: '', style: 'all', ready: false })}>Clear filters</button>
              : <span className="muted">Add a bottle from the Cellar page.</span>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Tint bar · vintage and style · name · producer and region · bottle count and drinking state. */
function WineRow({ g, showCellar, onClick }: { g: WineGroup; showCellar: boolean; onClick: () => void }) {
  const { wine } = g.first
  const cellars = new Set(g.bottles.map(b => b.cellar_name).filter(Boolean))
  const where = showCellar ? (cellars.size > 1 ? `In ${cellars.size} cellars` : [...cellars][0]) : null
  return (
    <button className="wine-row" onClick={onClick}
            aria-label={`${wine.vintage || 'NV'} ${wine.name}, ${wine.producer}. ${g.bottles.length} ${g.bottles.length === 1 ? 'bottle' : 'bottles'}.`}>
      <span className="tint-bar" style={{ background: colorVar(wine.color) }} />
      <span className="br-main">
        <span className="t-overline">{wine.vintage || 'NV'} · {STYLE_NAME[wine.color]}</span>
        <span className="br-title">{wine.name}</span>
        <span className="br-sub">{[wine.producer, wine.region, where].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="wr-meta">
        <span className="wr-qty">{g.bottles.length}</span>
        <WindowBadge s={g.first.window_status} />
      </span>
    </button>
  )
}
