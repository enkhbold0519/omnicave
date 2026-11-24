// Critic table logic: score badges, tasting-note tags and the verdict.
import { describe, expect, it } from 'vitest'
import { parseMessage, tagsOf, verdictOf, type Tasting } from '../src/sommelier/model'

const tasting = (msgs: [string, string][], kind: 'wine' | 'question' = 'wine'): Tasting => ({
  id: 't', topic: kind === 'wine' ? { kind, bottle_id: 1, title: 'Barolo' } : { kind, intent: 'tonight', text: '?', title: '?' },
  personaIds: ['victor', 'livia', 'marcus'], people: {}, ended: false, createdAt: 0,
  messages: msgs.map(([speaker, text], i) => ({ id: String(i), speaker, text })),
})

describe('parseMessage', () => {
  it('pulls the closing score line into a badge', () => {
    const p = parseMessage('Firm tannin and dark cherry.\nScore: 94. Peak: 2030.')
    expect(p.body).toBe('Firm tannin and dark cherry.')
    expect(p.score).toEqual({ label: '94', normalized: 94 })
    expect(p.peak).toBe(2030)
  })

  it('normalises every critic scale to 100 points', () => {
    expect(parseMessage('x Score: 17/20. Peak: 2029.').score?.normalized).toBe(85)
    expect(parseMessage('x Score: ★★★★. Peak: 2029.').score?.normalized).toBe(80)
    expect(parseMessage('x Score: 91-93. Peak: 2029.').score?.normalized).toBe(91)
  })

  it('leaves a message without a score line unchanged', () => {
    expect(parseMessage('Open it tonight.')).toEqual({ body: 'Open it tonight.' })
  })
})

describe('tagsOf', () => {
  it('finds tasting-note tags, longest phrase first and without duplicates', () => {
    const tags = tagsOf('Dark cherry, firm tannin, toasted oak and bright acidity; more cherry later.')
    expect(tags.map(t => t.label)).toEqual(['dark cherry', 'firm tannin', 'toasted oak', 'bright acidity'])
    expect(tags.map(t => t.kind)).toEqual(['fruit', 'structure', 'oak', 'freshness'])
  })

  it('shows at most four tags', () => {
    expect(tagsOf('cherry plum earth tannin oak acidity honey')).toHaveLength(4)
  })
})

describe('verdictOf', () => {
  it('reports consensus when the critics are within 6 points', () => {
    const v = verdictOf(tasting([['victor', 'a\nScore: 94. Peak: 2030.'], ['livia', 'b\nScore: 91. Peak: 2028.']]))
    expect(v.kind === 'wine' && v.agreement).toBe('consensus')
  })

  it('reports a split when the critics are more than 6 points apart, using each critic’s latest score', () => {
    const v = verdictOf(tasting([
      ['victor', 'a\nScore: 90. Peak: 2030.'], ['livia', 'b\nScore: 89. Peak: 2028.'], ['victor', 'c\nScore: 97. Peak: 2032.'],
    ]))
    expect(v.kind).toBe('wine')
    if (v.kind !== 'wine') return
    expect(v.agreement).toBe('split')
    expect(v.scores.find(s => s.personaId === 'victor')?.normalized).toBe(97)
  })

  it('lists each critic’s last pick for a question', () => {
    const t = tasting([], 'question')
    const bottle = { id: 7 } as never
    t.messages = [{ id: '1', speaker: 'marcus', text: 'This one', pick: bottle }, { id: '2', speaker: 'user', text: 'ok', pick: bottle }]
    expect(verdictOf(t)).toEqual({ kind: 'question', picks: [{ personaId: 'marcus', bottle }] })
  })
})
