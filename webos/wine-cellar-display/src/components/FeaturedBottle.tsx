import { useEffect, useMemo, useRef, useState } from 'react'
import { api, cachedGet, safeGet, safeSet, stream } from '../api'
import type { Bottle, Persona, StreamEvent } from '../types'
import { colorVar } from './ui'
import { WindowBar } from '../views/Briefing'
import { parseMessage } from '../sommelier/model'

const SHOW_MS = 20_000
const MAX_WINES = 8
type Shape = 'bordeaux' | 'burgundy' | 'champagne'

/* bottle outlines in a 200 × 600 box (neck at the top) */
const SHAPES: Record<Shape, string> = {
  bordeaux: 'M82,20 L118,20 L118,165 C118,205 160,212 160,262 L160,546 Q160,572 134,572 L66,572 Q40,572 40,546 L40,262 C40,212 82,205 82,165 Z',
  burgundy: 'M84,20 L116,20 L116,150 C116,232 166,252 166,322 L166,546 Q166,572 140,572 L60,572 Q34,572 34,546 L34,322 C34,252 84,232 84,150 Z',
  champagne: 'M86,20 L114,20 L114,150 C114,236 168,256 168,326 L168,546 Q168,572 142,572 L58,572 Q32,572 32,546 L32,326 C32,256 86,236 86,150 Z',
}
const shapeOf = (b: Bottle): Shape =>
  b.wine.color === 'sparkling' ? 'champagne'
    : /pinot|chardonnay|gamay|syrah|nebbiolo/i.test(b.wine.grape ?? '') || /burgund|bourgogne|rh[oô]ne|piedmont|barolo|chablis/i.test(`${b.wine.region} ${b.wine.name}`) ? 'burgundy'
    : 'bordeaux'

/* one sommelier note per wine per day, kept on the display (each note is an AI request) */
interface Note { day: string; persona: string; text: string; score?: string }
const NOTES_KEY = 'wc.saverNotes'
const today = () => new Date().toISOString().slice(0, 10)
function cachedNote(id: number): Note | null {
  try { const n = (JSON.parse(safeGet(NOTES_KEY) ?? '{}') as Record<string, Note>)[id]; return n && n.day === today() ? n : null } catch { return null }
}
function storeNote(id: number, n: Note) {
  try {
    const all = JSON.parse(safeGet(NOTES_KEY) ?? '{}') as Record<string, Note>
    const keep = Object.entries({ ...all, [id]: n } as Record<string, Note>).filter(([, v]) => v.day === today())   // drop yesterday's notes
    safeSet(NOTES_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch { /* storage full or blocked: just don't cache */ }
}
const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim()

/** Screen-saver style "Featured bottle": one wine at a time — a line-drawn bottle that fills with its colour, and a sommelier's note. */
export default function FeaturedBottle() {
  const [bottles, setBottles] = useState<Bottle[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [i, setI] = useState(0)
  const [notes, setNotes] = useState<Record<number, Note>>({})
  const asked = useRef(new Set<number>())

  useEffect(() => {
    cachedGet<Bottle[]>('/api/bottles?q=').then(r => setBottles(r.data)).catch(() => {})
    api<Persona[]>('GET', '/api/personas').then(ps => setPersonas(ps.filter(p => p.built_in))).catch(() => {})
    const t = setInterval(() => setI(x => x + 1), SHOW_MS)
    return () => clearInterval(t)
  }, [])

  // ready to drink first (closing soonest), then the most valuable; one bottle per wine
  const wines = useMemo(() => {
    const seen = new Set<string>(), out: { b: Bottle; why: string }[] = []
    const add = (b: Bottle, why: string) => { const k = `${b.wine.producer}|${b.wine.name}|${b.wine.vintage}`; if (!seen.has(k)) { seen.add(k); out.push({ b, why }) } }
    bottles.filter(b => b.window_status !== 'young').sort((a, b) => (a.wine.drink_to ?? 0) - (b.wine.drink_to ?? 0))
      .forEach(b => add(b, b.window_status === 'past-peak' ? 'Open it soon' : 'Ready to drink'))
    ;[...bottles].sort((a, b) => b.market.price - a.market.price).forEach(b => add(b, 'Most valuable'))
    return out.slice(0, MAX_WINES)
  }, [bottles])

  const cur = wines.length ? wines[i % wines.length] : null
  const next = wines.length ? wines[(i + 1) % wines.length] : null

  // fetch the note for the wine on screen and the next one, so it is ready when it appears
  useEffect(() => {
    if (!personas.length) return
    for (const [k, w] of [[i, cur], [i + 1, next]] as const) {
      if (!w || asked.current.has(w.b.id)) continue
      asked.current.add(w.b.id)
      const hit = cachedNote(w.b.id)
      if (hit) { setNotes(n => ({ ...n, [w.b.id]: hit })); continue }
      const p = personas[k % personas.length]
      let text = ''
      void stream('/api/ai/table', { topic: { kind: 'wine', bottle_id: w.b.id }, persona_ids: [p.id] },
        (e: StreamEvent) => { if (e.type === 'delta') text += e.text })
        .then(() => {
          const m = parseMessage(text)
          const note = { day: today(), persona: p.name, text: firstSentence(m.body), score: m.score?.label }
          storeNote(w.b.id, note); setNotes(n => ({ ...n, [w.b.id]: note }))
        }).catch(() => {})
    }
  }, [i, cur?.b.id, next?.b.id, personas]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) return null
  const { b } = cur
  const w = b.wine
  const note = notes[b.id]
  const year = new Date().getFullYear()
  const shape = shapeOf(b)

  return (
    <div key={`${b.id}-${i}`} className="featured">
      <BottleArt b={b} shape={shape} uid={`${b.id}-${i}`} />

      <div className="fb-info">
        <div className="fb-name">{w.name}</div>
        <div className="fb-vin">{w.vintage || 'NV'}</div>
        {w.drink_from && w.drink_to && (
          <div className="fb-window">
            <span className="t-overline">Best {w.drink_from}–{w.drink_to}</span>
            <WindowBar from={w.drink_from} to={w.drink_to} year={year} />
          </div>
        )}
        <div className="fb-note">
          {note && <>
            <p>“{note.text}”</p>
            <span className="fb-by">— {note.persona}{note.score ? <b> · {note.score}</b> : null}</span>
          </>}
        </div>
      </div>
    </div>
  )
}

/* ---------- the bottle, drawn: glass, wine, light, capsule, label, and a reflection on the shelf ---------- */
const GLASS: Record<string, { glass: string; tint: number; capsule: [string, string] }> = {
  red: { glass: '#14231a', tint: 0.62, capsule: ['#5c1824', '#8a2a3a'] },
  white: { glass: '#7f8c5a', tint: 0.28, capsule: ['#8a7440', '#c9b071'] },
  sparkling: { glass: '#1a2a1d', tint: 0.5, capsule: ['#8f7a45', '#d8c286'] },
  rose: { glass: '#e9ddd6', tint: 0.08, capsule: ['#b07c78', '#e0b3ab'] },
}

function BottleArt({ b, shape, uid }: { b: Bottle; shape: Shape; uid: string }) {
  const g = GLASS[b.wine.color] ?? GLASS.red
  const path = SHAPES[shape]
  const fillY = shape === 'champagne' ? 205 : 188
  const capH = shape === 'champagne' ? 150 : 86
  const word = (b.wine.producer.replace(/^(ch[aâ]teau|domaine|maison|bodegas?|weingut|cantina|tenuta)\s+/i, '').split(/\s+/)[0] ?? '').toUpperCase().slice(0, 12)
  const id = (n: string) => `${n}-${uid}`
  return (
    <svg className="fb-bottle" viewBox="0 0 200 800" width={262} height={1048} aria-hidden="true">
      <defs>
        <clipPath id={id('clip')}><path d={path} /></clipPath>
        <linearGradient id={id('round')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.7" /><stop offset="0.22" stopColor="#000" stopOpacity="0.1" />
          <stop offset="0.32" stopColor="#fff" stopOpacity="0.1" /><stop offset="0.62" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={id('spec')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.25" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0.35" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('cap')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={g.capsule[0]} /><stop offset="0.35" stopColor={g.capsule[1]} /><stop offset="1" stopColor={g.capsule[0]} />
        </linearGradient>
        <linearGradient id={id('paper')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#bfb7a6" /><stop offset="0.35" stopColor="#efe8d8" /><stop offset="1" stopColor="#b3ab9a" />
        </linearGradient>
        <linearGradient id={id('sweep')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.35" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('fade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" /><stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={id('mask')}><rect x="0" y="572" width="200" height="228" fill={`url(#${id('fade')})`} /></mask>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.07" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="575" rx="120" ry="20" fill={`url(#${id('glow')})`} />

      <g id={id('bottle')}>
        <g clipPath={`url(#${id('clip')})`} className="fb-glass">
          <rect x="0" y="0" width="200" height="600" fill={g.glass} opacity="0.9" />
          <rect className="fb-pour" x="0" y={fillY} width="200" height={600 - fillY} style={{ fill: colorVar(b.wine.color) }} />
          <rect x="0" y={fillY} width="200" height={600 - fillY} fill={g.glass} opacity={g.tint} />
          <rect className="fb-meniscus" x="0" y={fillY} width="200" height="2" fill="#fff" />
          <rect x="0" y="0" width="200" height="600" fill={`url(#${id('round')})`} />
          <rect x="56" y="20" width="12" height="552" fill={`url(#${id('spec')})`} opacity="0.55" />
          <rect x="146" y="240" width="3" height="320" fill="#fff" opacity="0.12" />
          <rect className="fb-sweep" x="-80" y="0" width="70" height="600" fill={`url(#${id('sweep')})`} transform="skewX(-12)" />
          {/* capsule over the neck */}
          <rect className="fb-cap" x="0" y="14" width="200" height={capH} fill={`url(#${id('cap')})`} />
          <rect className="fb-cap" x="0" y={14 + capH - 4} width="200" height="3" fill="#000" opacity="0.35" />
          {shape === 'champagne' && <g className="fb-cap" stroke="#e8dcb5" strokeOpacity="0.5" strokeWidth="1.2" fill="none">
            <path d="M84,120 L100,150 L116,120" /><path d="M88,70 L100,96 L112,70" /><line x1="80" y1="150" x2="120" y2="150" />
          </g>}
          {/* paper label */}
          <g className="fb-paper">
            <rect x="38" y="352" width="124" height="140" fill={`url(#${id('paper')})`} />
            <rect x="46" y="360" width="108" height="124" fill="none" stroke="#6d5f47" strokeOpacity="0.5" strokeWidth="0.8" />
            <text x="100" y="392" textAnchor="middle" className="fb-label-word">{word}</text>
            <line x1="70" y1="404" x2="130" y2="404" stroke="#6d5f47" strokeOpacity="0.6" strokeWidth="0.7" />
            <text x="100" y="442" textAnchor="middle" className="fb-label-vin">{b.wine.vintage || 'NV'}</text>
            <line x1="82" y1="458" x2="118" y2="458" stroke="#6d5f47" strokeOpacity="0.6" strokeWidth="0.7" />
          </g>
        </g>
        <path d={path} className="fb-outline" pathLength={1} />
      </g>

      {/* reflection on the glass shelf */}
      <g mask={`url(#${id('mask')})`} className="fb-reflection">
        <use href={`#${id('bottle')}`} transform="translate(0 1148) scale(1 -1)" />
      </g>
    </svg>
  )
}
