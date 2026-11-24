// @vitest-environment jsdom
// API client: offline cache, offline write queue, logout clean-up and the sign-up reply.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedGet, flushQueue, mutateOrQueue, needsVerification, queued, setToken } from '../src/api'

const ok = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
const offline = () => Promise.reject(new TypeError('Failed to fetch'))

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('offline cache', () => {
  it('serves the last good response, marked stale, when the cloud is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ok({ bottles: 3 })))
    expect(await cachedGet('/api/cellars')).toEqual({ data: { bottles: 3 }, stale: false })
    vi.stubGlobal('fetch', vi.fn(offline))
    expect(await cachedGet('/api/cellars')).toEqual({ data: { bottles: 3 }, stale: true })
  })

  it('fails when offline and nothing was cached', async () => {
    vi.stubGlobal('fetch', vi.fn(offline))
    await expect(cachedGet('/api/never')).rejects.toThrow('Cloud unreachable')
  })
})

describe('offline write queue', () => {
  it('keeps one change per path while offline and sends it on reconnect', async () => {
    vi.stubGlobal('fetch', vi.fn(offline))
    expect(await mutateOrQueue('PATCH', '/api/zones/1', { target: 12 }, 'Set 12 °C')).toBeNull()
    await mutateOrQueue('PATCH', '/api/zones/1', { target: 13 }, 'Set 13 °C')
    expect(queued()).toEqual([{ method: 'PATCH', path: '/api/zones/1', body: { target: 13 }, label: 'Set 13 °C' }])

    const sent = vi.fn(() => ok({}))
    vi.stubGlobal('fetch', sent)
    await flushQueue()
    expect(sent).toHaveBeenCalledTimes(1)
    expect(queued()).toEqual([])
  })
})

describe('logout', () => {
  it('removes the previous user’s data but keeps the display settings', () => {
    localStorage.setItem('wc.token', 'abc')
    localStorage.setItem('wc.cache./api/cellars', '{"bottles":3}')
    localStorage.setItem('wc.queue', '[{"path":"/api/zones/1"}]')
    localStorage.setItem('wc.tastings', '[{"id":"t"}]')
    localStorage.setItem('wc.apiBase', 'https://example.test')
    localStorage.setItem('wc.saver', '{"after":5}')

    setToken(null)

    expect(Object.keys(localStorage).sort()).toEqual(['wc.apiBase', 'wc.saver'])
  })

  it('keeps the data when a new token is stored', () => {
    localStorage.setItem('wc.cache./api/cellars', '{}')
    setToken('new-token')
    expect(localStorage.getItem('wc.cache./api/cellars')).toBe('{}')
  })
})

describe('needsVerification (sign-up reply)', () => {
  it('asks for the email code only when the server requires it', () => {
    expect(needsVerification({ verification_required: true, email: 'a@b.c' })).toBe(true)
    // regression: the normal login reply also carries the flag, set to false
    expect(needsVerification({ access_token: 't', verification_required: false, user: {} })).toBe(false)
    expect(needsVerification({ access_token: 't', user: {} })).toBe(false)
    expect(needsVerification(null)).toBe(false)
  })
})
