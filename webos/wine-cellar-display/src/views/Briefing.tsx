import { usePoll } from '../hooks'

interface Brief {
  date: string; summary: string; insights: string[]; news_is_sample: boolean; briefing_time: string
  news: { title: string; link: string; summary: string; source: string; relevance: number; matched: string[] }[]
}

export default function Briefing() {
  const { data: b, stale } = usePoll<Brief>('/api/briefing', 60_000)
  if (!b) return <div className="view muted">Loading briefing…</div>
  return (
    <div className="view">
      <h2 className="view-title">Daily Wine Briefing <span className="muted small">{b.date}{stale ? ' · cached' : ''}</span></h2>
      <div className="card"><p className="lead">{b.summary}</p>
        <p className="muted small">Push summary to your phone every day at {b.briefing_time} (change in Settings)</p></div>
      <div className="card">
        <h3>Your cellar today</h3>
        <ul className="insights">{b.insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      <div className="card">
        <h3>News for your collection {b.news_is_sample && <span className="badge env-alert">sample — feeds unreachable</span>}</h3>
        <div className="news">
          {b.news.map((n, i) => (
            <div key={i} className="news-item">
              <div className="news-title">{n.title}</div>
              {n.summary && !b.news_is_sample && <div className="muted small">{n.summary}</div>}
              <div className="tiny muted">{n.source}{n.matched.length > 0 && <> · matches your <b className="accent">{n.matched.join(', ')}</b></>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
