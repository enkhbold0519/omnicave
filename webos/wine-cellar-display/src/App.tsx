import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { api, getToken, OfflineError, safeGet, safeSet, setToken, setUnauthorizedHandler } from './api'
import { useDraft, usePoll } from './hooks'
import type { Bottle, Cellar, CellarSummary, Detection, EnvZone, Notification, User } from './types'
import Header from './components/Header'
import Icon, { type IconName } from './components/Icon'
import EnvStrip from './components/EnvStrip'
import CellarView, { type PlacePoint, type ViewMode } from './components/CellarView'
import BottleSheet from './components/BottleSheet'
import BottleForm from './components/BottleForm'
import ReviewDetection from './components/ReviewDetection'
import Notifications from './components/Notifications'
import Login from './views/Login'
import Search from './views/Search'
import Sommelier from './views/Sommelier'
import Briefing from './views/Briefing'
import Value from './views/Value'
import Profile, { type Orientation } from './views/Profile'

const W = 1080, H = 1920
const isWebOS = location.protocol === 'file:' || 'PalmSystem' in window || /Web0S|webOS/i.test(navigator.userAgent)

/** Fits the fixed 1080x1920 portrait canvas into any screen; rotates 90° on landscape panels. */
function Stage({ orientation, children }: { orientation: Orientation; children: ReactNode }) {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useLayoutEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const rotate = orientation === 'rotate' || (orientation === 'auto' && isWebOS && vp.w > vp.h)
  let transform: string
  if (rotate) {
    const s = Math.min(vp.w / H, vp.h / W)
    transform = `translate(${(vp.w - H * s) / 2 + H * s}px, ${(vp.h - W * s) / 2}px) rotate(90deg) scale(${s})`
  } else {
    const s = Math.min(vp.w / W, vp.h / H)
    transform = `translate(${(vp.w - W * s) / 2}px, ${(vp.h - H * s) / 2}px) scale(${s})`
  }
  return <div className="stage" style={{ width: W, height: H, transform }}>{children}</div>
}

/** Five main pages, same as the mobile apps. Profile (with settings) opens from the avatar, not from the tab bar. */
type Tab = 'cellar' | 'inventory' | 'sommelier' | 'briefing' | 'value'
type Page = Tab | 'profile'
const TABS: [Tab, IconName, string][] = [
  ['cellar', 'cellar', 'Cellar'], ['inventory', 'inventory', 'Inventory'], ['sommelier', 'sommelier', 'Sommelier'],
  ['briefing', 'briefing', 'Briefing'], ['value', 'value', 'Value'],
]
const PAGES: Page[] = [...TABS.map(t => t[0]), 'profile']

export default function App() {
  const [orientation, setOrientationState] = useState<Orientation>(() => (safeGet('wc.orientation') as Orientation) || 'auto')
  const setOrientation = (o: Orientation) => { safeSet('wc.orientation', o); setOrientationState(o) }
  const [user, setUser] = useState<User | null>(null)
  const [booting, setBooting] = useState(!!getToken())

  useEffect(() => {
    setUnauthorizedHandler(() => { setToken(null); setUser(null) })
    if (!getToken()) return
    const cached = safeGet('wc.user')
    api<User>('GET', '/api/me')
      .then(u => { setUser(u); safeSet('wc.user', JSON.stringify(u)) })
      .catch(e => { if (e instanceof OfflineError && cached) setUser(JSON.parse(cached)) }) // offline: keep the session
      .finally(() => setBooting(false))
  }, [])

  const onUser = (u: User | null) => { setUser(u); safeSet('wc.user', u ? JSON.stringify(u) : null) }

  return (
    <Stage orientation={orientation}>
      {booting ? <div className="boot muted">Connecting…</div>
        : user ? <Main user={user} onUser={onUser} orientation={orientation} setOrientation={setOrientation} />
        : <Login onLogin={onUser} />}
    </Stage>
  )
}

function Main({ user, onUser, orientation, setOrientation }: { user: User; onUser: (u: User | null) => void; orientation: Orientation; setOrientation: (o: Orientation) => void }) {
  const [savedPage, setTab] = useDraft<Page>('page', 'cellar')
  const tab: Page = PAGES.includes(savedPage) ? savedPage : 'cellar'
  const [lastTab, setLastTab] = useState<Tab>(tab === 'profile' ? 'cellar' : tab)
  const go = (p: Page) => { if (p !== 'profile') setLastTab(p); setTab(p) }
  const [cellarId, setCellarId] = useDraft<number | null>('cellar', null)
  const cellars = usePoll<CellarSummary[]>('/api/cellars', 10_000)
  const cellar = usePoll<Cellar>(cellarId ? `/api/cellars/${cellarId}` : null, 5_000)
  const env = usePoll<{ zones: EnvZone[] }>(cellarId ? `/api/cellars/${cellarId}/environment` : null, 5_000)
  const notifs = usePoll<{ items: Notification[]; unread: number }>('/api/notifications', 5_000)
  const detections = usePoll<Detection[]>('/api/detections', 5_000)

  const [selected, setSelected] = useState<Bottle | null>(null)
  const [highlight, setHighlight] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useDraft<ViewMode>('viewmode', 'door')
  const [placing, setPlacing] = useState<null | { bottleId: number; layer: 'front' | 'back' }>(null)
  const [form, setForm] = useState<null | { bottle?: Bottle }>(null)
  const [review, setReview] = useState<Detection | null>(null)
  const [showNotifs, setShowNotifs] = useState(false)
  const [toast, setToast] = useState<{ text: string; level: string } | null>(null)
  const lastNotif = useRef<number | null>(null)

  const flash = useCallback((text: string, level = 'info') => { setToast({ text, level }); setTimeout(() => setToast(null), 5000) }, [])

  // pick the first cellar if none chosen / chosen one deleted
  useEffect(() => {
    const list = cellars.data
    if (list?.length && !list.some(c => c.id === cellarId)) setCellarId(list[0].id)
  }, [cellars.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // keep the open bottle in sync with fresh data; close it if it left the cellar
  useEffect(() => {
    if (!selected || !cellar.data || cellar.data.id !== selected.cellar_id) return
    const fresh = cellar.data.bottles.find(b => b.id === selected.id)
    if (!fresh) setSelected(null)
    else if (fresh.x !== selected.x || fresh.y !== selected.y || fresh.wine.name !== selected.wine.name || fresh.wine.vintage !== selected.wine.vintage) setSelected(fresh)
  }, [cellar.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // pop critical alerts as a toast (push-style)
  useEffect(() => {
    const items = notifs.data?.items
    if (!items?.length) return
    const top = items[0]
    if (lastNotif.current !== null && top.id > lastNotif.current && !top.read) flash(top.message, top.level)
    lastNotif.current = Math.max(lastNotif.current ?? 0, top.id)
  }, [notifs.data, flash])

  const refreshAll = () => { void cellar.refresh(); void cellars.refresh(); void notifs.refresh(); void detections.refresh() }

  const pick = (b: Bottle, highlightSet?: Bottle[]) => {
    if (b.cellar_id !== cellarId) setCellarId(b.cellar_id)
    setSelected(b)
    go('cellar')
    const hl = new Set((highlightSet ?? [b]).filter(x => x.cellar_id === b.cellar_id).map(x => x.id))
    setHighlight(hl)
    setTimeout(() => setHighlight(new Set()), 8000)
  }
  const pickById = async (id: number) => { try { pick(await api<Bottle>('GET', `/api/bottles/${id}`)) } catch (e) { flash((e as Error).message, 'warning') } }

  const place = async (pt: PlacePoint) => {
    if (!placing) return
    try {
      const b = await api<Bottle>('PATCH', `/api/bottles/${placing.bottleId}`, { position: pt })
      setPlacing(null); refreshAll(); setSelected(b)
      flash(b.warnings?.length ? '⚠ ' + b.warnings.join(' · ') : `Moved to ${b.location}`, b.warnings?.length ? 'warning' : 'info')
    } catch (e) { flash((e as Error).message, 'warning') }
  }

  const pending = (detections.data ?? []).filter(d => d.cellar_id === cellarId)

  return (
    <div className="app">
      <Header user={user} cellars={cellars.data ?? []} cellarId={cellarId} onCellar={id => { setCellarId(id); setSelected(null) }}
              unread={notifs.data?.unread ?? 0} onBell={() => setShowNotifs(true)}
              onProfile={() => go(tab === 'profile' ? lastTab : 'profile')} profileOpen={tab === 'profile'} />

      <main className="content">
        {tab === 'cellar' && (
          <div className="view cellar-view">
            <EnvStrip zones={env.data?.zones} stale={env.stale} />
            <div className="toolbar">
              <div className="seg mini">
                <button className={viewMode === 'door' ? 'on' : ''} onClick={() => setViewMode('door')}>Door</button>
                <button className={viewMode === '3d' ? 'on' : ''} onClick={() => setViewMode('3d')}>3D</button>
              </div>
              <button className="btn" onClick={() => setForm({})}>＋ Add bottle</button>
            </div>
            {placing && (
              <div className="place-banner">
                <span>Tap the new spot on the door view</span>
                <div className="seg mini">
                  <button className={placing.layer === 'front' ? 'on' : ''} onClick={() => setPlacing({ ...placing, layer: 'front' })}>Front row</button>
                  <button className={placing.layer === 'back' ? 'on' : ''} onClick={() => setPlacing({ ...placing, layer: 'back' })}>Back row</button>
                </div>
                <button className="btn" onClick={() => setPlacing(null)}>Cancel</button>
              </div>
            )}
            {pending.length > 0 && !placing && (
              <button className="detect-banner" onClick={() => setReview(pending[0])}>
                {pending.length === 1 ? '1 new bottle' : `${pending.length} new bottles`} to review — tap to confirm
              </button>
            )}
            {cellar.data
              ? <MapArea>{(w, h) => (
                  <CellarView cellar={cellar.data!} mode={viewMode} width={w} height={h} selectedId={selected?.id ?? null}
                              highlight={highlight} ghosts={pending} onSelect={b => pick(b)}
                              placing={placing ? { layer: placing.layer } : null} onPlace={place} onGhost={d => setReview(d)} />
                )}</MapArea>
              : <div className="muted">{cellar.error ?? 'Loading cellar…'}</div>}
            {cellar.stale && <div className="offline-note">Offline — showing last synced inventory. Climate changes are queued.</div>}
            {selected && !placing && <BottleSheet bottle={cellar.data?.bottles.find(b => b.id === selected.id) ?? selected} onClose={() => setSelected(null)} onEdit={() => setForm({ bottle: selected })}
                                          onMove={() => setPlacing({ bottleId: selected.id, layer: selected.layer })} onChanged={refreshAll} />}
          </div>
        )}
        {tab === 'inventory' && <Search cellarId={cellarId} onPick={pick} />}
        {tab === 'sommelier' && <Sommelier onPick={b => pick(b)} />}
        {tab === 'briefing' && <Briefing />}
        {tab === 'value' && <Value onPick={pickById} />}
        {tab === 'profile' && (
          <Profile onBack={() => go(lastTab)} user={user} onUser={onUser} cellar={cellar.data} cellars={cellars.data ?? []} envZones={env.data?.zones}
                    onCellarsChanged={id => { void cellars.refresh(); void cellar.refresh(); if (id) setCellarId(id) }}
                    onCellarChanged={() => { void cellar.refresh(); void cellars.refresh() }}
                    orientation={orientation} onOrientation={setOrientation} />
        )}
      </main>

      <nav className="nav">
        {TABS.map(([k, icon, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}>
            <Icon name={icon} size={36} /><span>{l}</span>
          </button>
        ))}
      </nav>

      {toast && <div className={`toast-float lvl-${toast.level}`} onClick={() => setToast(null)}>{toast.text}</div>}
      {form && cellar.data && (
        <BottleForm cellar={cellar.data} bottle={form.bottle} onClose={() => setForm(null)}
                    onSaved={b => { setForm(null); refreshAll(); pick(b) }} />
      )}
      {review && (
        <ReviewDetection d={review} onClose={() => { setReview(null); refreshAll() }}
                         onConfirmed={b => { setReview(null); refreshAll(); pick(b); flash('Registered — critics are discussing it now') }} />
      )}
      {showNotifs && <Notifications items={notifs.data?.items ?? []} onClose={() => setShowNotifs(false)} onChanged={() => notifs.refresh()} />}
    </div>
  )
}

/** Measures the free area left for the cellar drawing (fixed canvas, so measure once per layout). */
function MapArea({ children }: { children: (w: number, h: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return <div ref={ref} className="map-wrap">{size && size.h > 50 && children(size.w, size.h)}</div>
}
