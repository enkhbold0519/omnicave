import type { StreamEvent } from './types'

/* ------------------------------------------------------------------ *
 * API base URL
 *  - browser dev (vite): same origin, /api is proxied to localhost:8000
 *  - webOS (file://)   : VirtualBox NAT reaches the host PC at 10.0.2.2
 *  - override at runtime in Settings (saved in localStorage)
 * ------------------------------------------------------------------ */
const LS = {
  token: 'wc.token',
  base: 'wc.apiBase',
  cache: 'wc.cache.',
  queue: 'wc.queue',
}

export function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function safeSet(key: string, val: string | null) {
  try { val === null ? localStorage.removeItem(key) : localStorage.setItem(key, val) } catch { /* storage unavailable */ }
}

export function defaultBase(): string {
  const env = import.meta.env.VITE_API_BASE as string | undefined
  if (env) return env
  return location.protocol === 'file:' ? 'http://10.0.2.2:8000' : ''
}
export function apiBase(): string { return safeGet(LS.base) ?? defaultBase() }
export function setApiBase(v: string) { safeSet(LS.base, v.trim() || null) }

export function getToken() { return safeGet(LS.token) }
export function setToken(t: string | null) { safeSet(LS.token, t) }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export class OfflineError extends Error {}

/* connection status listeners (header indicator) */
type Listener = (online: boolean) => void
const listeners = new Set<Listener>()
let lastOnline = true
export function onConnection(l: Listener) { listeners.add(l); l(lastOnline); return () => { listeners.delete(l) } }
function setOnline(v: boolean) {
  if (v !== lastOnline) { lastOnline = v; listeners.forEach(l => l(v)); if (v) void flushQueue() }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

async function raw(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  let res: Response
  try {
    res = await fetch(apiBase() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    setOnline(false)
    throw new OfflineError('Cloud unreachable')
  }
  setOnline(true)
  if (res.status === 401 && t) onUnauthorized()
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).detail ?? msg } catch { /* not json */ }
    throw new ApiError(res.status, msg)
  }
  return res
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await raw(method, path, body)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

/** GET with offline fallback: last good response is cached in localStorage. */
export async function cachedGet<T>(path: string): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await api<T>('GET', path)
    safeSet(LS.cache + path, JSON.stringify(data))
    return { data, stale: false }
  } catch (e) {
    if (e instanceof OfflineError) {
      const c = safeGet(LS.cache + path)
      if (c) return { data: JSON.parse(c) as T, stale: true }
    }
    throw e
  }
}

/* -------- offline write queue (e.g. temperature setpoints) -------- */
interface QueuedOp { method: string; path: string; body: unknown; label: string }
export function queued(): QueuedOp[] {
  try { return JSON.parse(safeGet(LS.queue) || '[]') } catch { return [] }
}
/** Try now; if the cloud is unreachable, keep it and sync later. */
export async function mutateOrQueue<T>(method: string, path: string, body: unknown, label: string): Promise<T | null> {
  try {
    return await api<T>(method, path, body)
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e
    const q = queued().filter(o => o.path !== path)
    q.push({ method, path, body, label })
    safeSet(LS.queue, JSON.stringify(q))
    return null
  }
}
export async function flushQueue() {
  const q = queued()
  const left: QueuedOp[] = []
  for (const op of q) {
    try { await api(op.method, op.path, op.body) } catch (e) { if (e instanceof OfflineError) left.push(op) }
  }
  safeSet(LS.queue, JSON.stringify(left))
}

/* -------- Server-Sent Events over POST (token streaming) -------- */
export async function stream(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await raw('POST', path, body, signal)
  if (!res.body) throw new Error('Streaming not supported')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const line = chunk.split('\n').find(l => l.startsWith('data:'))
      if (line) onEvent(JSON.parse(line.slice(5)) as StreamEvent)
    }
  }
}

/** sqlite UTC 'YYYY-MM-DD HH:MM:SS' -> Date */
export const parseTs = (s: string) => new Date(s.replace(' ', 'T') + 'Z')
