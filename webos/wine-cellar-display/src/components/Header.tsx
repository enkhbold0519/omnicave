import { useClock, useOnline } from '../hooks'
import { queued } from '../api'
import type { CellarSummary, User } from '../types'
import Icon from './Icon'

interface Props {
  user: User
  cellars: CellarSummary[]
  cellarId: number | null
  onCellar: (id: number) => void
  unread: number
  onBell: () => void
  onProfile: () => void
  profileOpen: boolean
}

export function initials(u: User) {
  const name = (u.display_name || u.username).trim()
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

/** Clock on the left; cellar, connection, notifications and the profile avatar on the right.
 *  Connection and sign-in state stay visible on every page (paper: usability NFR). */
export default function Header({ user, cellars, cellarId, onCellar, unread, onBell, onProfile, profileOpen }: Props) {
  const t = useClock()
  const { net, cloud } = useOnline()
  const pending = queued().length
  const conn = !net ? { cls: 'bad', text: 'No network' }
    : !cloud ? { cls: 'warn', text: 'Offline' }
    : pending > 0 ? { cls: 'warn', text: `Syncing ${pending}` }
    : { cls: 'ok', text: 'Online' }

  return (
    <header className="header">
      <div className="clock-block">
        <div className="clock">{t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
        <div className="date">{t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <div className="header-right">
        {cellars.length > 1 && (
          <select className="cellar-select" value={cellarId ?? ''} onChange={e => onCellar(Number(e.target.value))} aria-label="Cellar">
            {cellars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <span className={`conn ${conn.cls}`} role="status"><i className="led" />{conn.text}</span>
        <button className="icon-btn bell" onClick={onBell} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Icon name="bell" />
          {unread > 0 && <span className="bell-n">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button className={`avatar-btn ${profileOpen ? 'on' : ''}`} onClick={onProfile} aria-label={`Profile — signed in as ${user.username}`}>
          {initials(user)}
        </button>
      </div>
    </header>
  )
}
