import { useState } from 'react'
import { api } from '../api'
import type { Focus, Love, Persona, PersonaTraits, Scoring, Tone } from '../types'
import Icon from '../components/Icon'
import { Field } from '../components/ui'
import { Avatar } from './NewTasting'

const COLORS = ['#7A3340', '#2F5D50', '#3E4F7A', '#7A5A2B', '#5B3F6E', '#2E6070', '#6B4A3A', '#4A4F55']
const SCALES: [Scoring, string][] = [['hundred', '100 points'], ['twenty', '20 points'], ['stars', '5 stars']]
const FOCUS: [Focus, string][] = [['old-world', 'Old World'], ['new-world', 'New World'], ['everywhere', 'Everywhere']]
const LOVES: [Love, string][] = [['power', 'Power'], ['elegance', 'Elegance'], ['acidity', 'Freshness'], ['oak', 'Oak'],
  ['fruit', 'Ripe fruit'], ['age', 'Ageing'], ['value', 'Value'], ['terroir', 'Terroir']]
const STRICT = ['Generous', 'Kind', 'Balanced', 'Exacting', 'Severe']
const TONES: [Tone, string][] = [['formal', 'Formal'], ['warm', 'Warm'], ['playful', 'Playful'], ['blunt', 'Blunt']]

function Head({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="page-head"><button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h2>{title}</h2></div>
}

export function PersonaList({ personas, onBack, onOpen }: { personas: Persona[]; onBack: () => void; onOpen: (p: Persona | null) => void }) {
  return (
    <div className="view sommelier">
      <Head title="Your sommeliers" onBack={onBack} />
      <div className="rows">
        {personas.map(p => (
          <button key={p.id} className="start-row" onClick={() => onOpen(p)}>
            <Avatar p={p} size={64} />
            <span className="br-main"><span className="t-heading">{p.name}</span><span className="br-sub">{p.title}{p.built_in ? ' · built-in' : ''}</span></span>
            <span className="set-chev"><Icon name="chevron" size={24} /></span>
          </button>
        ))}
      </div>
      <button className="btn big start-btn" onClick={() => onOpen(null)}>＋ Add a sommelier</button>
    </div>
  )
}

/** Android PersonaEditorScreen: who they are and how they judge. Built-in sommeliers are shown read-only. */
export function PersonaEditor({ persona, onBack, onSaved }: { persona: Persona | null; onBack: () => void; onSaved: () => void }) {
  const builtIn = !!persona?.built_in
  const [f, setF] = useState({
    name: persona?.name ?? '', title: persona?.title ?? '', color: persona?.color ?? COLORS[1],
    traits: persona?.traits ?? { scoring: 'hundred', focus: 'everywhere', loves: ['elegance'], strictness: 3, tone: 'warm', description: '' } as PersonaTraits,
  })
  const [memory, setMemory] = useState(persona?.memory ?? [])
  const [confirmDel, setConfirmDel] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const tr = f.traits
  const setT = (patch: Partial<PersonaTraits>) => setF({ ...f, traits: { ...tr, ...patch } })
  const toggleLove = (l: Love) => setT({ loves: tr.loves.includes(l) ? tr.loves.filter(x => x !== l) : tr.loves.length < 3 ? [...tr.loves, l] : tr.loves })

  const save = async () => {
    try {
      await api(persona ? 'PATCH' : 'POST', persona ? `/api/personas/${persona.id}` : '/api/personas', f)
      onSaved()
    } catch (e) { setErr((e as Error).message) }
  }
  const del = async () => { try { await api('DELETE', `/api/personas/${persona!.id}`); onSaved() } catch (e) { setErr((e as Error).message) } }
  const clearMemory = async () => { await api('DELETE', `/api/personas/${persona!.id}/memory`); setMemory([]) }

  const seg = <T extends string | number>(opts: [T, string][], val: T, on: (v: T) => void) => (
    <div className="seg">{opts.map(([k, l]) => <button key={String(k)} className={val === k ? 'on' : ''} disabled={builtIn} onClick={() => on(k)}>{l}</button>)}</div>
  )

  return (
    <div className="view sommelier settings">
      <Head title={persona ? persona.name : 'New sommelier'} onBack={onBack} />
      {builtIn && <p className="muted">A built-in sommelier. You can't change how they judge, but you can clear what they remember about you.</p>}

      <div className="editor-top">
        <Avatar p={{ name: f.name || '?', color: f.color }} size={112} />
        <div className="form-col grow">
          <Field label="Name"><input value={f.name} maxLength={40} disabled={builtIn} placeholder="e.g. Mina Park" onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Role"><input value={f.title} maxLength={60} disabled={builtIn} placeholder="e.g. The Value Hunter" onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        </div>
      </div>
      {!builtIn && (
        <section>
          <h3>Colour</h3>
          <div className="chip-row">
            {COLORS.map(c => <button key={c} className={`color-dot ${f.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={`Colour ${c}`} aria-pressed={f.color === c} />)}
          </div>
        </section>
      )}

      {builtIn && persona?.philosophy && <section><h3>How they judge</h3><p className="fg-2">{persona.philosophy}</p></section>}
      {!builtIn && <>
        <section><h3>Scores on</h3>{seg(SCALES, tr.scoring, v => setT({ scoring: v }))}</section>
        <section><h3>Looks mostly at</h3>{seg(FOCUS, tr.focus, v => setT({ focus: v }))}</section>
        <section>
          <h3>Loves · up to 3</h3>
          <div className="chip-row">
            {LOVES.map(([k, l]) => <button key={k} className={`pill ${tr.loves.includes(k) ? 'on' : ''}`} role="checkbox" aria-checked={tr.loves.includes(k)} onClick={() => toggleLove(k)}>{l}</button>)}
          </div>
        </section>
        <section><h3>Strictness</h3>{seg(STRICT.map((l, i) => [i + 1, l] as [number, string]), tr.strictness, v => setT({ strictness: v }))}</section>
        <section><h3>Tone</h3>{seg(TONES, tr.tone, v => setT({ tone: v }))}</section>
        <section>
          <h3>In their own words</h3>
          <textarea value={tr.description} maxLength={400} placeholder="Anything else about how they taste and talk" onChange={e => setT({ description: e.target.value })} />
        </section>
      </>}

      {persona && (
        <section>
          <div className="section-head">
            <h3>Remembers about you</h3>
            {memory.length > 0 && <button className="link-btn" onClick={clearMemory}>Clear</button>}
          </div>
          {memory.length ? <ul className="insights">{memory.map(m => <li key={m}>{m}</li>)}</ul>
            : <p className="muted">Nothing yet. Tell them at a tasting, e.g. “I love Riesling”.</p>}
        </section>
      )}

      {err && <div className="error">{err}</div>}
      {!builtIn && (
        <div className="row-btns editor-actions">
          <button className="btn primary big" disabled={!f.name.trim() || !tr.loves.length} onClick={save}>{persona ? 'Save Changes' : 'Add sommelier'}</button>
          {persona && (confirmDel
            ? <><button className="btn danger" onClick={del}>Delete {persona.name.split(' ')[0]}</button><button className="btn" onClick={() => setConfirmDel(false)}>Keep</button></>
            : <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>)}
        </div>
      )}
    </div>
  )
}
