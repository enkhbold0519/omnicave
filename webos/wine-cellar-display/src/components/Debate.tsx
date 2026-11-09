import type { Turn } from '../useStream'

export default function Debate({ turns, running, error, firstTokenMs }: { turns: Turn[]; running: boolean; error: string | null; firstTokenMs: number | null }) {
  return (
    <div className="debate">
      {turns.map((t, i) => (
        <div key={i} className="bubble" style={{ borderColor: t.color }}>
          <div className="bubble-head">
            <span className="avatar" style={{ background: t.color }}>{t.name[0]}</span>
            <b>{t.name}</b> <span className="muted small">{t.title}</span>
            {t.adapter && <span className="muted tiny">LoRA: {t.adapter}</span>}
          </div>
          <div className="bubble-text">{t.text}{!t.done && <span className="cursor">▍</span>}</div>
        </div>
      ))}
      {running && turns.length === 0 && <div className="muted">Critics are gathering…</div>}
      {error && <div className="error">{error}</div>}
      {firstTokenMs !== null && <div className="muted tiny">first token {firstTokenMs} ms</div>}
    </div>
  )
}
