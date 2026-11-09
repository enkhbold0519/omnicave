import { useCallback, useEffect, useRef, useState } from 'react'
import { cachedGet, onConnection, safeGet, safeSet } from './api'

/** Poll a GET endpoint; falls back to cached data when offline. */
export function usePoll<T>(path: string | null, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path

  const refresh = useCallback(async () => {
    const p = pathRef.current
    if (!p) return
    try {
      const r = await cachedGet<T>(p)
      if (pathRef.current === p) { setData(r.data); setStale(r.stale); setError(null) }
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    setData(null)
    if (!path) return
    void refresh()
    const t = setInterval(refresh, intervalMs)
    return () => clearInterval(t)
  }, [path, intervalMs, refresh])

  return { data, stale, error, refresh }
}

/** State persisted to localStorage so unsaved input survives restarts / network drops. */
export function useDraft<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void] {
  const k = 'wc.draft.' + key
  const [v, setV] = useState<T>(() => {
    const s = safeGet(k)
    if (!s) return initial
    try { return JSON.parse(s) as T } catch { return initial }
  })
  useEffect(() => { safeSet(k, JSON.stringify(v)) }, [k, v])
  const clear = useCallback(() => { safeSet(k, null); setV(initial) }, [k]) // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV, clear]
}

export function useOnline() {
  const [cloud, setCloud] = useState(true)
  const [net, setNet] = useState(navigator.onLine)
  useEffect(() => onConnection(setCloud), [])
  useEffect(() => {
    const on = () => setNet(true), off = () => setNet(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return { net, cloud, online: net && cloud }
}

export function useClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i) }, [])
  return t
}
