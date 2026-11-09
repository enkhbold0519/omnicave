import { useEffect, useState } from 'react'
import { cachedGet } from '../api'
import { useDraft } from '../hooks'
import type { Bottle } from '../types'
import { BottleRow } from '../components/ui'

const FIELDS = [['all', 'All'], ['name', 'Name'], ['winery', 'Winery'], ['region', 'Region'], ['vintage', 'Vintage'], ['grape', 'Grape']] as const

export default function Search({ cellarId, onPick }: { cellarId: number | null; onPick: (b: Bottle, all: Bottle[]) => void }) {
  const [s, setS] = useDraft('search', { q: '', field: 'all', everywhere: true })
  const [res, setRes] = useState<Bottle[]>([])
  const [stale, setStale] = useState(false)
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      const t0 = performance.now()
      const qs = new URLSearchParams({ q: s.q, field: s.field, ...(s.everywhere || !cellarId ? {} : { cellar_id: String(cellarId) }) })
      try {
        const r = await cachedGet<Bottle[]>(`/api/bottles?${qs}`)
        setRes(r.data); setStale(r.stale); setMs(Math.round(performance.now() - t0))
      } catch { setRes([]) }
    }, 200)
    return () => clearTimeout(t)
  }, [s.q, s.field, s.everywhere, cellarId])

  return (
    <div className="view">
      <h2 className="view-title">Search inventory</h2>
      <input className="search-input" placeholder="Wine, winery, region, vintage or grape…" value={s.q} onChange={e => setS({ ...s, q: e.target.value })} />
      <div className="chip-row">
        {FIELDS.map(([k, l]) => <button key={k} className={`pill ${s.field === k ? 'on' : ''}`} onClick={() => setS({ ...s, field: k })}>{l}</button>)}
        <button className={`pill ${s.everywhere ? 'on' : ''}`} onClick={() => setS({ ...s, everywhere: !s.everywhere })}>All cellars</button>
      </div>
      <div className="muted small">{res.length} result(s){ms !== null ? ` · ${ms} ms` : ''}{stale ? ' · offline (cached)' : ''}</div>
      <div className="list scroll">
        {res.map(b => <BottleRow key={b.id} b={b} onClick={() => onPick(b, res)} />)}
      </div>
    </div>
  )
}
