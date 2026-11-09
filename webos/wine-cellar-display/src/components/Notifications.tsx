import { api, parseTs } from '../api'
import type { Notification } from '../types'
import { Modal } from './ui'

export default function Notifications({ items, onClose, onChanged }: { items: Notification[]; onClose: () => void; onChanged: () => void }) {
  const readAll = async () => { await api('POST', '/api/notifications/read', {}); onChanged() }
  return (
    <Modal title="Notifications" onClose={onClose}>
      <div className="modal-actions top"><button className="btn" onClick={readAll}>Mark all read</button></div>
      {items.length === 0 && <p className="muted">Nothing yet.</p>}
      <div className="notif-list">
        {items.map(n => (
          <div key={n.id} className={`notif lvl-${n.level} ${n.read ? 'read' : ''}`}>
            <span className="notif-kind">{n.kind}</span>
            <span className="notif-msg">{n.message}</span>
            <span className="muted tiny">{parseTs(n.created_at).toLocaleString('ko-KR')}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
