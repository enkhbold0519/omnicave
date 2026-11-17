import type { Turn } from '../useStream'
import { parseMessage } from '../sommelier/model'

export default function Debate({ turns, running, error }: { turns: Turn[]; running: boolean; error: string | null }) {
  return (
    <div className="debate">
      {turns.map((t, i) => (
        <div key={i} className="bubble" style={{ borderColor: t.color }}>
          <div className="bubble-head">
            <span className="avatar" style={{ background: t.color }}>{t.name[0]}</span>
            <b>{t.name}</b> <span className="muted small">{t.title}</span>
            {parseMessage(t.text).score && <span className="score-badge">{parseMessage(t.text).score!.label}</span>}
          </div>
          <div className="bubble-text">{parseMessage(t.text).body}{!t.done && <span className="cursor">▍</span>}</div>
        </div>
      ))}
      {running && turns.length === 0 && <div className="muted">The sommeliers are tasting…</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
