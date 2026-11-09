import { useClock, useOnline } from '../hooks'
import { queued } from '../api'
import type { CellarSummary, LlmInfo, User } from '../types'

interface Props {
  user: User
  cellars: CellarSummary[]
  cellarId: number | null
  onCellar: (id: number) => void
  unread: number
  onBell: () => void
  llm: LlmInfo | null
}

export default function Header({ user, cellars, cellarId, onCellar, unread, onBell, llm }: Props) {
  const t = useClock()
  const { net, cloud } = useOnline()
  const pending = queued().length
  return (
    <header className="header">
      <div className="clock-block">
        <div className="clock">{t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
        <div className="date">{t.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
      </div>
      <div className="header-right">
        <div className="chips">
          <span className={`chip ${net && cloud ? 'ok' : 'bad'}`}>
            <i className="led" /> {!net ? 'No network' : cloud ? 'Cloud connected' : 'Cloud offline · cached'}
          </span>
          <span className="chip ok"><i className="led" /> {user.display_name || user.username}</span>
          {llm && <span className={`chip ${llm.provider === 'mock' ? 'warn' : 'ok'}`}>AI: {llm.provider === 'mock' ? 'offline mock' : llm.model}</span>}
          {pending > 0 && <span className="chip warn">{pending} change(s) waiting to sync</span>}
          <button className="bell" onClick={onBell} aria-label="Notifications">
            🔔{unread > 0 && <span className="bell-n">{unread}</span>}
          </button>
        </div>
        <select className="cellar-select" value={cellarId ?? ''} onChange={e => onCellar(Number(e.target.value))}>
          {cellars.map(c => <option key={c.id} value={c.id}>{c.devices?.some(d => d.online) ? '● ' : ''}{c.name} ({c.bottle_count ?? 0})</option>)}
        </select>
      </div>
    </header>
  )
}
