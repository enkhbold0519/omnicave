import { useEffect, useState } from 'react'
import { cachedGet } from '../api'
import { useDraft } from '../hooks'
import { useStream } from '../useStream'
import StreamOutput from '../components/StreamOutput'
import { BottleRow } from '../components/ui'
import type { Bottle } from '../types'

type Mode = 'ask' | 'meal' | 'curate' | 'personal' | 'ready'

export default function Sommelier({ onPick }: { onPick: (b: Bottle) => void }) {
  const [mode, setMode] = useDraft<Mode>('somm-mode', 'ask')
  const [f, setF] = useDraft('somm', { ask: '', meal: '', budget: '', flavor: '', theme: '' })
  const s = useStream()
  const [win, setWin] = useState<{ ready: Bottle[]; approaching: Bottle[]; past_peak: Bottle[] } | null>(null)

  useEffect(() => {
    s.abort()
    if (mode === 'ready') void cachedGet<typeof win>('/api/recommendations/windows').then(r => setWin(r.data)).catch(() => setWin(null))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => {
    if (mode === 'ask') void s.run('/api/ai/ask', { query: f.ask })
    if (mode === 'meal') void s.run('/api/ai/pairing/meal', { meal: f.meal })
    if (mode === 'curate') void s.run('/api/ai/curate', { budget: Number(f.budget) || 0, flavor: f.flavor, theme: f.theme })
    if (mode === 'personal') void s.run('/api/ai/personal', {})
  }

  const MODES: [Mode, string][] = [['ask', 'Ask'], ['meal', 'Meal pairing'], ['curate', 'Curated list'], ['personal', 'For you'], ['ready', 'Ready to drink']]
  return (
    <div className="view">
      <h2 className="view-title">AI Sommelier</h2>
      <div className="seg">{MODES.map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>

      {mode === 'ask' && (
        <div className="ask">
          <textarea placeholder="예) 이번 주말 친구들이랑 삼겹살 먹는데 셀러에서 뭐 꺼낼까?" value={f.ask} onChange={e => setF({ ...f, ask: e.target.value })} />
          <button className="btn primary big" onClick={go} disabled={!f.ask.trim() || s.running}>Ask</button>
        </div>
      )}
      {mode === 'meal' && (
        <div className="ask">
          <textarea placeholder="What are you eating? e.g. 연어 스테이크, 마라탕, 트러플 파스타" value={f.meal} onChange={e => setF({ ...f, meal: e.target.value })} />
          <button className="btn primary big" onClick={go} disabled={!f.meal.trim() || s.running}>Find a pairing</button>
        </div>
      )}
      {mode === 'curate' && (
        <div className="ask">
          <div className="form-grid">
            <label className="field"><span>Budget per bottle (USD)</span><input inputMode="numeric" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} /></label>
            <label className="field"><span>Flavor profile</span><input placeholder="light, bold, fruity, bubbly…" value={f.flavor} onChange={e => setF({ ...f, flavor: e.target.value })} /></label>
          </div>
          <label className="field"><span>Event theme</span><input placeholder="birthday dinner, BBQ party, anniversary…" value={f.theme} onChange={e => setF({ ...f, theme: e.target.value })} /></label>
          <button className="btn primary big" onClick={go} disabled={s.running}>Curate list</button>
        </div>
      )}
      {mode === 'personal' && (
        <div className="ask">
          <p className="muted">Based on what you opened before (vision removals and “Opened” taps) and your preferences.</p>
          <button className="btn primary big" onClick={go} disabled={s.running}>Recommend for me</button>
        </div>
      )}
      {mode === 'ready' && win && (
        <div className="list scroll">
          <div className="list-h">At peak now ({win.ready.length})</div>
          {win.ready.map(b => <BottleRow key={b.id} b={b} onClick={() => onPick(b)} right={<span className="muted">until {b.wine.drink_to}</span>} />)}
          <div className="list-h">Approaching — opens next year ({win.approaching.length})</div>
          {win.approaching.map(b => <BottleRow key={b.id} b={b} onClick={() => onPick(b)} right={<span className="muted">from {b.wine.drink_from}</span>} />)}
          {win.past_peak.length > 0 && <div className="list-h">Past peak ({win.past_peak.length})</div>}
          {win.past_peak.map(b => <BottleRow key={b.id} b={b} onClick={() => onPick(b)} />)}
        </div>
      )}
      {mode !== 'ready' && <StreamOutput s={s} onPick={onPick} />}
    </div>
  )
}
