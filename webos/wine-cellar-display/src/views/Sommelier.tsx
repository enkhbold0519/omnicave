import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Bottle, Persona } from '../types'
import { deleteTastings, loadTastings, newTasting, saveTasting, type Intent, type Tasting, type Topic } from '../sommelier/model'
import { Avatar, NewTasting } from '../sommelier/NewTasting'
import TastingView from '../sommelier/TastingView'
import { PersonaEditor, PersonaList } from '../sommelier/Personas'
import Icon from '../components/Icon'

type Screen =
  | { s: 'home' }
  | { s: 'new'; kind: 'wine' | Intent; bottle?: Bottle }
  | { s: 'tasting'; t: Tasting }
  | { s: 'personas' }
  | { s: 'edit'; persona: Persona | null }

const STARTS: { kind: 'wine' | Intent; title: string; sub: string }[] = [
  { kind: 'wine', title: 'Discuss a wine', sub: 'Scores, tasting notes and when to open it' },
  { kind: 'tonight', title: 'What to open tonight', sub: 'Each sommelier picks a bottle' },
  { kind: 'pairing', title: 'Pair with a meal', sub: 'Tell them what you are eating' },
  { kind: 'open', title: 'Ask anything', sub: 'Any question about your wine' },
]

/** Android Sommelier tab: your sommeliers, start a tasting, recent conversations. */
export default function Sommelier({ onPick, startWine, onStarted }: { onPick: (b: Bottle) => void; startWine?: Bottle | null; onStarted?: () => void }) {
  const [screen, setScreen] = useState<Screen>({ s: 'home' })
  const [personas, setPersonas] = useState<Persona[]>([])
  const [recent, setRecent] = useState<Tasting[]>(loadTastings)
  const [error, setError] = useState<string | null>(null)

  const load = () => api<Persona[]>('GET', '/api/personas').then(ps => { setPersonas(ps); setError(null) }).catch(e => setError((e as Error).message))
  useEffect(() => { void load() }, [])
  // "Ask the sommeliers" on Wine Details opens a new tasting with that wine already chosen
  useEffect(() => { if (startWine) { setScreen({ s: 'new', kind: 'wine', bottle: startWine }); onStarted?.() } }, [startWine]) // eslint-disable-line react-hooks/exhaustive-deps

  const home = () => { setRecent(loadTastings()); setScreen({ s: 'home' }) }
  const start = (topic: Topic, seats: Persona[]) => { const t = newTasting(topic, seats); saveTasting(t); setScreen({ s: 'tasting', t }) }

  if (screen.s === 'new') return <NewTasting kind={screen.kind} bottle={screen.bottle} personas={personas} onBack={home} onStart={start} onEditPersonas={() => setScreen({ s: 'personas' })} />
  if (screen.s === 'tasting') return <TastingView initial={screen.t} personas={personas} onBack={home} onPick={onPick} />
  if (screen.s === 'personas') return <PersonaList personas={personas} onBack={home} onOpen={p => setScreen({ s: 'edit', persona: p })} />
  if (screen.s === 'edit') return <PersonaEditor persona={screen.persona} onBack={() => setScreen({ s: 'personas' })}
                                                 onSaved={() => { void load(); setScreen({ s: 'personas' }) }} />

  return (
    <div className="view sommelier">
      <div className="title-row">
        <div>
          <h2>Sommelier</h2>
          <div className="muted small">A table of sommeliers who taste with you</div>
        </div>
      </div>
      {error && <div className="error small">{error}</div>}

      <section>
        <div className="section-head">
          <h3>Your sommeliers · {personas.length}</h3>
          <button className="link-btn" onClick={() => setScreen({ s: 'personas' })}>Edit</button>
        </div>
        <div className="persona-strip">
          {personas.map(p => (
            <button key={p.id} className="persona-chip static-chip" onClick={() => setScreen({ s: 'edit', persona: p })}>
              <Avatar p={p} size={88} />
              <span className="pc-name">{p.name.split(' ')[0]}</span>
              <span className="pc-title">{p.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Start a tasting</h3>
        <div className="rows">
          {STARTS.map(x => (
            <button key={x.kind} className="start-row" onClick={() => setScreen({ s: 'new', kind: x.kind })} disabled={personas.length < 2}>
              <span className="br-main"><span className="t-heading">{x.title}</span><span className="br-sub">{x.sub}</span></span>
              <span className="set-chev"><Icon name="chevron" size={24} /></span>
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <div className="section-head">
            <h3>Recent conversations</h3>
            <button className="link-btn" onClick={() => { deleteTastings(); setRecent([]) }}>Clear</button>
          </div>
          <div className="rows">
            {recent.slice(0, 5).map(t => (
              <button key={t.id} className="start-row" onClick={() => setScreen({ s: 'tasting', t })}>
                <span className="br-main">
                  <span className="br-title">{t.topic.title}</span>
                  <span className="br-sub">{t.personaIds.map(id => t.people[id]?.name.split(' ')[0]).filter(Boolean).join(', ')} · {t.ended ? 'Ended' : 'In progress'} · {when(t.createdAt)}</span>
                </span>
                <span className="set-chev"><Icon name="chevron" size={24} /></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function when(ms: number) {
  const min = Math.floor((Date.now() - ms) / 60000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.floor(min / 60)} h ago` : `${Math.floor(min / 1440)} d ago`
}
