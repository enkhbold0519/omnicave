import { useState } from 'react'
import { usePoll } from '../hooks'
import type { Bottle, EnvZone } from '../types'
import { colorVar, money, pct } from '../components/ui'
import { zoneLabel, zoneState } from '../components/CellarStatus'

interface Brief {
  date: string; summary: string; insights: string[]; news_is_sample: boolean; briefing_time: string
  news: { title: string; link: string; summary: string; source: string; relevance: number; matched: string[] }[]
}
interface Windows { ready: Bottle[]; approaching: Bottle[]; past_peak: Bottle[]; year: number }
interface Market { total: number; change_12m: number }
interface Props { cellarId: number | null; onOpen: (b: Bottle) => void; onValue: () => void }

/** Daily briefing, readable at a glance: one sentence, three tiles, a few bottles, three headlines. */
export default function Briefing({ cellarId, onOpen, onValue }: Props) {
  const { data: b, stale } = usePoll<Brief>('/api/briefing', 5 * 60_000)
  const { data: win } = usePoll<Windows>('/api/recommendations/windows', 5 * 60_000)
  const { data: env } = usePoll<{ zones: EnvZone[] }>(cellarId ? `/api/cellars/${cellarId}/environment?minutes=1440` : null, 5 * 60_000)
  const { data: mkt } = usePoll<Market>('/api/market/summary', 10 * 60_000)
  const [openNews, setOpenNews] = useState<number | null>(null)
  const [allNews, setAllNews] = useState(false)
  if (!b || !win) return <div className="view muted">Preparing your briefing…</div>

  const year = win.year
  const zones = env?.zones ?? []
  const states = zones.map(zoneState)
  const climate = states.includes('offline') ? { text: 'Sensor offline', cls: 'offline' } : states.includes('alert') ? { text: 'Needs a look', cls: 'alert' } : { text: 'All normal', cls: 'ok' }
  // drink first what will not wait: past-peak bottles, then ready ones whose window closes soonest
  const openSoon = [...win.past_peak, ...win.ready].slice(0, 3)
  const ready = win.ready.length, soon = win.approaching.length
  const headline = [
    ready ? `${ready} ${ready === 1 ? 'bottle is' : 'bottles are'} ready to drink` : 'Nothing is at its peak yet',
    win.past_peak.length ? `${win.past_peak.length} should be opened soon` : null,
  ].filter(Boolean).join(', ') + '.'
  const news = allNews ? b.news : b.news.slice(0, 3)

  return (
    <div className="view briefing">
      <header className="brief-top">
        <h2>Briefing{stale && <span className="muted small"> · offline</span>}</h2>
        <p className="brief-headline">{headline}</p>
        {mkt && (
          <button className="brief-value" onClick={onValue}>
            Collection {money(mkt.total)} <span className={mkt.change_12m >= 0 ? 'up' : 'down'}>{mkt.change_12m >= 0 ? '▲' : '▼'} {pct(mkt.change_12m)}</span> this year →
          </button>
        )}
      </header>

      <div className="brief-tiles">
        <div className="brief-tile">
          <BottleEnds bottles={win.ready} />
          <span className="t-display">{ready}</span>
          <span className="t-overline">Ready now</span>
        </div>
        <div className="brief-tile">
          <span className="tile-note">in {year + 1}</span>
          <span className="t-display">{soon}</span>
          <span className="t-overline">Ready next year</span>
        </div>
        <div className={`brief-tile climate-tile ${climate.cls}`}>
          <div className="tile-sparks">
            {zones.map(z => <Spark key={z.id} z={z} />)}
          </div>
          <span className="t-title">{climate.text}</span>
          <span className="t-overline">Climate · 24 h</span>
        </div>
      </div>

      {openSoon.length > 0 && (
        <section>
          <h3>Open soon</h3>
          <div className="rows">
            {openSoon.map(x => {
              const past = x.window_status === 'past-peak'
              return (
                <button key={x.id} className="soon-row" onClick={() => onOpen(x)}>
                  <span className="tint-bar" style={{ background: colorVar(x.wine.color) }} />
                  <span className="br-main">
                    <span className="br-title">{x.wine.name} {x.wine.vintage || 'NV'}</span>
                    <WindowBar from={x.wine.drink_from ?? year} to={x.wine.drink_to ?? year} year={year} />
                  </span>
                  <span className={`soon-until ${past ? 'down' : x.wine.drink_to !== undefined && x.wine.drink_to <= year + 1 ? 'warn-text-inline' : 'muted'}`}>
                    {past ? 'Past its best' : `until ${x.wine.drink_to}`}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h3>News for you</h3>
          {b.news_is_sample && <span className="muted small">Sample stories (offline)</span>}
        </div>
        <div className="rows">
          {news.map((n, i) => (
            <button key={i} className="news-row" onClick={() => setOpenNews(openNews === i ? null : i)} aria-expanded={openNews === i}>
              <span className="src-badge" aria-hidden="true">{n.source.replace(/^the\s+/i, '').charAt(0).toUpperCase()}</span>
              <span className="br-main">
                <span className="news-title">{n.title}</span>
                <span className="news-meta">
                  <span className="muted small">{n.source}</span>
                  {n.matched.slice(0, 2).map(k => <span key={k} className="tag tag-match">{k}</span>)}
                </span>
                {openNews === i && n.summary && <span className="news-summary fg-2">{n.summary}</span>}
              </span>
            </button>
          ))}
        </div>
        {b.news.length > 3 && <button className="link-btn" onClick={() => setAllNews(!allNews)}>{allNews ? 'Show less' : `Show ${b.news.length - 3} more`}</button>}
      </section>

      <p className="muted small">A short version is sent to your phone every day at {b.briefing_time}.</p>
    </div>
  )
}

/** Drinking window as a bar from the first to the last good year, with a dot for this year. */
export function WindowBar({ from, to, year }: { from: number; to: number; year: number }) {
  const lo = Math.min(from, year), hi = Math.max(to, year)
  const span = Math.max(1, hi - lo)
  const left = ((from - lo) / span) * 100, width = Math.max(2, ((to - from) / span) * 100)
  const now = ((year - lo) / span) * 100
  const state = year > to ? 'past' : year >= to - 1 ? 'ending' : year < from ? 'early' : 'ok'
  return (
    <span className={`wbar ${state}`} aria-label={`Drink ${from} to ${to}`}>
      <span className="wbar-track" />
      <span className="wbar-fill" style={{ left: `${left}%`, width: `${width}%` }} />
      <span className="wbar-now" style={{ left: `${now}%` }} />
      <span className="wbar-y lo">{from}</span><span className="wbar-y hi">{to}</span>
    </span>
  )
}

/** Up to five glass bottle ends in the wines' colours, like the cellar map. */
function BottleEnds({ bottles }: { bottles: Bottle[] }) {
  const shown = bottles.slice(0, 5)
  return (
    <svg className="tile-ends" width={shown.length * 34 + 6} height={40} aria-hidden="true">
      {shown.map((b, i) => (
        <g key={b.id} transform={`translate(${20 + i * 34}, 20)`}>
          <circle r={16} style={{ fill: colorVar(b.wine.color) }} className="btl-glass" />
          <circle r={12.5} className="btl-rim" />
          <circle r={5.5} className="btl-punt" />
          <circle cx={-6} cy={-6.5} r={2} className="btl-shine" />
        </g>
      ))}
    </svg>
  )
}

/** A tiny 24-hour temperature line for one zone. */
function Spark({ z }: { z: EnvZone }) {
  const v = z.history.map(h => h.temp)
  const w = 150, h = 34
  const st = zoneState(z)
  if (v.length < 2) return <span className="spark-empty muted small">{zoneLabel(z.name)}</span>
  const lo = Math.min(...v, z.temp_min), hi = Math.max(...v, z.temp_max)
  const x = (i: number) => (i / (v.length - 1)) * w, y = (t: number) => h - 3 - ((t - lo) / (hi - lo || 1)) * (h - 6)
  return (
    <svg className={`spark ${st}`} width={w} height={h} aria-label={`${zoneLabel(z.name)}: ${v[v.length - 1].toFixed(1)} °C`}>
      <rect x={0} width={w} y={y(z.temp_max)} height={Math.max(0, y(z.temp_min) - y(z.temp_max))} className="spark-band" />
      <path d={v.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(t).toFixed(1)}`).join('')} />
    </svg>
  )
}
