import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bottle, Persona } from '../types'
import Icon from '../components/Icon'
import { WindowBadge, colorVar } from '../components/ui'
import { Avatar } from './NewTasting'
import { parseMessage, saveTasting, tagsOf, useTable, verdictOf, type Message, type Tasting } from './model'

const QUICK = {
  wine: ["Who's right?", 'Explain it simply', 'What should I eat with it?', 'When should I open it?'],
  question: ['Why that bottle?', 'Something lighter?', 'What about value?'],
}

/** Android DebateScreen: each sommelier speaks once, then the table waits — Continue, Join in, or End for a verdict. */
export default function TastingView({ initial, personas, onBack, onPick }: { initial: Tasting; personas: Persona[]; onBack: () => void; onPick: (b: Bottle) => void }) {
  const [t, setT] = useState(initial)
  const [joining, setJoining] = useState(false)
  const [draft, setDraft] = useState('')
  const [mention, setMention] = useState<string | null>(null)
  const onChange = useCallback((x: Tasting) => setT(x), [])
  const { round, stop, running, error } = useTable(t, onChange)
  const scroller = useRef<HTMLDivElement>(null)

  // a fresh tasting starts by itself (paper: the debate is triggered when a wine is chosen)
  useEffect(() => { if (!initial.messages.length && !initial.ended) void round() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight }, [t.messages.length, t.messages[t.messages.length - 1]?.text.length, t.ended])

  const person = (id: string) => personas.find(p => p.id === id) ?? { id, ...(t.people[id] ?? { name: 'Sommelier', title: '', color: '#4A4F55' }) }
  const send = (text: string) => {
    const msg = mention ? `@${person(mention).name.split(' ')[0]} ${text}` : text
    setJoining(false); setDraft(''); const m = mention; setMention(null)
    void round({ userText: msg, mention: m ?? undefined })
  }
  const end = () => { const x = { ...t, ended: true }; setT(x); saveTasting(x) }
  const verdict = t.ended ? verdictOf(t) : null
  const thinking = running && t.messages[t.messages.length - 1]?.speaker
  const quick = QUICK[t.topic.kind]

  return (
    <div className="view tasting">
      <div className="page-head">
        <button className="icon-btn" onClick={() => { stop(); onBack() }} aria-label="Back"><Icon name="back" /></button>
        <div className="tasting-title">
          <span className="t-title">{t.topic.title}</span>
          <span className="tasting-people">{t.personaIds.map(id => <Avatar key={id} p={person(id)} size={36} />)}</span>
        </div>
      </div>

      <div className="messages" ref={scroller}>
        {t.messages.map(m => m.speaker === 'user'
          ? <div key={m.id} className="msg-user">{m.text}</div>
          : <SommelierMessage key={m.id} m={m} p={person(m.speaker)} onPick={onPick} />)}
        {running && !t.messages.some(m => m.streaming) && <div className="muted thinking">The sommeliers are tasting…</div>}
        {error && <div className="error small">{error}</div>}
        {verdict && <VerdictCard v={verdict} person={person} onPick={onPick} />}
      </div>

      <div className="table-bar">
        {t.ended ? (
          <div className="row-btns"><button className="btn" onClick={onBack}>Back to sommeliers</button></div>
        ) : running ? (
          <div className="row-btns">
            <span className="muted">{thinking && thinking !== 'user' ? `${person(thinking).name.split(' ')[0]} is speaking…` : 'Listening…'}</span>
            <button className="btn" onClick={stop}>Stop</button>
          </div>
        ) : joining ? (
          <div className="join">
            <div className="chip-row">
              {quick.map(q => <button key={q} className="pill" onClick={() => send(q)}>{q}</button>)}
            </div>
            <div className="chip-row">
              <span className="muted small">Ask one:</span>
              {t.personaIds.map(id => (
                <button key={id} className={`pill ${mention === id ? 'on' : ''}`} onClick={() => setMention(mention === id ? null : id)}>@{person(id).name.split(' ')[0]}</button>
              ))}
            </div>
            <div className="join-input">
              <input autoFocus value={draft} placeholder={mention ? `Ask ${person(mention).name.split(' ')[0]}…` : 'Say something to the table…'}
                     onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) send(draft.trim()) }} />
              <button className="btn primary" disabled={!draft.trim()} onClick={() => send(draft.trim())}>Send</button>
              <button className="btn" onClick={() => { setJoining(false); setMention(null) }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="table-actions">
            <button className="btn" onClick={() => void round()}>Continue</button>
            <button className="btn" onClick={() => setJoining(true)}>Join in</button>
            <button className="btn primary" onClick={end} disabled={!t.messages.length}>End & verdict</button>
          </div>
        )}
      </div>
    </div>
  )
}

function SommelierMessage({ m, p, onPick }: { m: Message; p: { name: string; title: string; color: string }; onPick: (b: Bottle) => void }) {
  const { body, score, peak } = parseMessage(m.text)
  const tags = m.streaming ? [] : tagsOf(body)
  return (
    <div className="msg">
      <Avatar p={p} size={52} />
      <div className="msg-main">
        <div className="msg-head">
          <span className="t-heading">{p.name}</span><span className="muted small">{p.title}</span>
          {score && <span className="score-badge">{score.label}</span>}
        </div>
        <div className="msg-text">{body}{m.streaming && <span className="cursor">▍</span>}</div>
        {(tags.length > 0 || peak) && (
          <div className="msg-tags">
            {tags.map(tg => <span key={tg.label} className={`tag tag-${tg.kind}`}>{tg.label}</span>)}
            {peak && <span className="tag tag-peak">Peak {peak}</span>}
          </div>
        )}
        {m.pick && (
          <button className="pick-card" onClick={() => onPick(m.pick!)}>
            <span className="tint-bar" style={{ background: colorVar(m.pick.wine.color) }} />
            <span className="br-main"><span className="br-title">{m.pick.wine.name} {m.pick.wine.vintage || 'NV'}</span>
              <span className="br-sub">{m.pick.location.replace(/ · (front|back)$/, '')}</span></span>
            <WindowBadge s={m.pick.window_status} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Scores side by side with a drinking-window timeline, or each sommelier's pick (Android VerdictCard). */
function VerdictCard({ v, person, onPick }: { v: ReturnType<typeof verdictOf>; person: (id: string) => { name: string; color: string }; onPick: (b: Bottle) => void }) {
  if (v.kind === 'question') {
    return (
      <div className="verdict">
        <h3>Their picks</h3>
        {v.picks.length === 0 && <p className="muted">No bottles were picked.</p>}
        {v.picks.map(({ personaId, bottle }) => (
          <button key={personaId} className="verdict-row" onClick={() => onPick(bottle)}>
            <Avatar p={person(personaId)} size={44} />
            <span className="br-main"><span className="br-sub">{person(personaId).name}</span><span className="br-title">{bottle.wine.name} {bottle.wine.vintage || 'NV'}</span></span>
            <Icon name="chevron" size={24} />
          </button>
        ))}
      </div>
    )
  }
  const year = new Date().getFullYear()
  const peaks = v.scores.map(s => s.peak)
  const lo = Math.min(year, ...peaks) - 1, hi = Math.max(year, ...peaks) + 2
  const x = (y: number) => `${((y - lo) / (hi - lo)) * 100}%`
  return (
    <div className="verdict">
      <div className="section-head">
        <h3>Verdict</h3>
        <span className={v.agreement === 'consensus' ? 'up' : 'warn-text-inline'}>{v.agreement === 'consensus' ? 'Consensus' : 'Split decision'}</span>
      </div>
      {v.scores.length === 0 && <p className="muted">No scores yet — let them talk a little longer.</p>}
      {v.scores.map(s => (
        <div key={s.personaId} className="verdict-row static">
          <Avatar p={person(s.personaId)} size={44} />
          <span className="br-main"><span className="br-title">{person(s.personaId).name}</span></span>
          <span className="score-badge big">{s.label}</span>
          <span className="muted small">peak {s.peak}</span>
        </div>
      ))}
      {v.scores.length > 0 && (
        <div className="timeline" aria-label={`Peak years: ${v.scores.map(s => `${person(s.personaId).name} ${s.peak}`).join(', ')}`}>
          <div className="tl-track" />
          <span className="tl-now" style={{ left: x(year) }}><i />Now</span>
          {v.scores.map(s => <span key={s.personaId} className="tl-dot" style={{ left: x(s.peak), background: person(s.personaId).color }} title={`${person(s.personaId).name}: ${s.peak}`} />)}
          <span className="tl-label" style={{ left: 0 }}>{lo}</span>
          <span className="tl-label end" style={{ right: 0 }}>{hi}</span>
        </div>
      )}
    </div>
  )
}
