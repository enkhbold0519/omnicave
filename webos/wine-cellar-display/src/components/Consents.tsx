import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { Consent, LegalInfo } from '../types'
import { Modal } from './ui'

/** The consent list and policy texts from the server (GET /api/legal). */
export function useLegal() {
  const [legal, setLegal] = useState<LegalInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<LegalInfo>('GET', '/api/legal').then(setLegal).catch(e => setError((e as Error).message))
  }, [])
  return { legal, error }
}

export const requiredAccepted = (legal: LegalInfo, value: Record<string, boolean>) =>
  legal.consents.every(c => !c.required || value[c.key])

/* ---------- policy text: the small subset of Markdown the policy files use ---------- */

const inline = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = []
  // blocks are separated by blank lines; the modal shows the title, so the file's own "# Title" is skipped
  text.split(/\n\s*\n/).forEach((block, i) => {
    const lines = block.split('\n').filter(l => l.trim())
    const first = lines[0] ?? ''
    if (first.startsWith('# ')) return
    if (first.startsWith('## ')) out.push(<h3 key={i}>{first.slice(3)}</h3>)
    else if (first.startsWith('|')) {
      const [head, , ...body] = lines
      out.push(
        <table key={i}><thead><tr>{cells(head).map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
          <tbody>{body.map((r, k) => <tr key={k}>{cells(r).map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table>,
      )
    } else if (/^(\d+\.|-) /.test(first)) {
      // list items; an indented line continues the item above it
      const items = lines.reduce<string[]>((acc, l) => (/^(\d+\.|-) /.test(l) ? [...acc, l.replace(/^(\d+\.|-) /, '')] : [...acc.slice(0, -1), acc[acc.length - 1] + ' ' + l.trim()]), [])
      out.push(<ol key={i}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ol>)
    } else out.push(<p key={i}>{inline(lines.join(' '))}</p>)
  })
  return <div className="policy-text">{out.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</div>
}

export function PolicyText({ legal, doc, onClose }: { legal: LegalInfo; doc: 'terms' | 'privacy'; onClose: () => void }) {
  return (
    <Modal title={doc === 'terms' ? 'Terms of Service' : 'Privacy Policy'} onClose={onClose} wide>
      <Markdown text={legal.documents[doc]} />
    </Modal>
  )
}

/* ---------- sign-up consents ---------- */

function Check({ on }: { on: boolean }) {
  return <span className={`check ${on ? 'on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
}

/** Sign-up consents (PIPA): required and optional items are separate, each can be read in full.
 *  Summaries are shown for the personal-data items, where PIPA asks for purpose and retention up front. */
export function ConsentList({ legal, value, onChange }: { legal: LegalInfo; value: Record<string, boolean>; onChange: (v: Record<string, boolean>) => void }) {
  const [doc, setDoc] = useState<'terms' | 'privacy' | null>(null)
  const all = legal.consents.every(c => value[c.key])
  const showSummary = (c: Consent) => c.key === 'privacy' || c.key === 'overseas'
  return (
    <div className="consents">
      <button className="consent consent-all" role="checkbox" aria-checked={all}
              onClick={() => onChange(Object.fromEntries(legal.consents.map(c => [c.key, !all])))}>
        <Check on={all} />
        <span className="consent-text"><span className="consent-title">Agree to all</span></span>
      </button>
      {legal.consents.map(c => (
        <div key={c.key} className="consent-line">
          <button className="consent" role="checkbox" aria-checked={!!value[c.key]} onClick={() => onChange({ ...value, [c.key]: !value[c.key] })}>
            <Check on={!!value[c.key]} />
            <span className="consent-text">
              <span className="consent-title"><span className={`consent-kind ${c.required ? 'req' : ''}`}>{c.required ? 'Required' : 'Optional'}</span>{c.title}</span>
              {showSummary(c) && <span className="consent-summary">{c.summary}</span>}
            </span>
          </button>
          {c.document && <button className="consent-view" onClick={() => setDoc(c.document)}>View ›</button>}
        </div>
      ))}
      {doc && <PolicyText legal={legal} doc={doc} onClose={() => setDoc(null)} />}
    </div>
  )
}
