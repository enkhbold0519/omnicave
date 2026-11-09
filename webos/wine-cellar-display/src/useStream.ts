import { useCallback, useEffect, useRef, useState } from 'react'
import { OfflineError, stream } from './api'
import type { Bottle, LlmInfo, Market, StreamEvent, Wine } from './types'

export interface Turn { persona: string; name: string; title: string; color: string; adapter?: string; text: string; done: boolean }

/** Runs one SSE request and accumulates text, structured items and debate turns. */
export function useStream() {
  const [text, setText] = useState('')
  const [items, setItems] = useState<Bottle[]>([])
  const [purchase, setPurchase] = useState<(Wine & { market: Market })[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [provider, setProvider] = useState<LlmInfo | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [firstTokenMs, setFirstTokenMs] = useState<number | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  const abort = useCallback(() => { ctrl.current?.abort(); ctrl.current = null; setRunning(false) }, [])

  const run = useCallback(async (path: string, body: unknown) => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setText(''); setItems([]); setPurchase([]); setTurns([]); setError(null); setRunning(true); setFirstTokenMs(null)
    const t0 = performance.now()
    let first = true
    const onEvent = (e: StreamEvent) => {
      if (c.signal.aborted) return
      switch (e.type) {
        case 'items': setItems(e.items); setPurchase(e.purchase ?? []); break
        case 'meta': setProvider(e.provider); break
        case 'turn': setTurns(ts => [...ts, { persona: e.persona, name: e.name, title: e.title, color: e.color, adapter: e.adapter, text: '', done: false }]); break
        case 'turn_end': setTurns(ts => ts.map(t => (t.persona === e.persona ? { ...t, done: true } : t))); break
        case 'delta':
          if (first) { first = false; setFirstTokenMs(Math.round(performance.now() - t0)) }
          if (e.persona) setTurns(ts => ts.map((t, i) => (i === ts.length - 1 ? { ...t, text: t.text + e.text } : t)))
          else setText(s => s + e.text)
          break
        case 'error': setError(e.message); break
      }
    }
    try {
      await stream(path, body, onEvent, c.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof OfflineError ? 'Cloud AI unavailable while offline' : (e as Error).message)
    } finally {
      if (ctrl.current === c) setRunning(false)
    }
  }, [])

  useEffect(() => () => ctrl.current?.abort(), [])
  return { run, abort, text, items, purchase, turns, provider, running, error, firstTokenMs }
}
