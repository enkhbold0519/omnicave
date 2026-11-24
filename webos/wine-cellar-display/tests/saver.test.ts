// @vitest-environment jsdom
// Screen saver: night hours, idle timeout and the alternating style.
import { beforeEach, describe, expect, it } from 'vitest'
import { isNight, nextSaverStyle, saverTimeoutMs, setSaver } from '../src/saver'

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m)

beforeEach(() => localStorage.clear())

describe('night mode (23:00 to 07:00)', () => {
  it('is on from 23:00 until just before 07:00', () => {
    expect(isNight(at(22, 59))).toBe(false)
    expect(isNight(at(23, 0))).toBe(true)
    expect(isNight(at(3))).toBe(true)
    expect(isNight(at(6, 59))).toBe(true)
    expect(isNight(at(7, 0))).toBe(false)
  })

  it('can be switched off', () => {
    setSaver({ night: false })
    expect(isNight(at(2))).toBe(false)
  })
})

describe('idle timeout', () => {
  it('defaults to 2 minutes and follows the setting', () => {
    expect(saverTimeoutMs()).toBe(120_000)
    setSaver({ after: 5 })
    expect(saverTimeoutMs()).toBe(300_000)
  })
})

describe('alternate style', () => {
  it('switches between the 3D cellar and the featured bottle each time', () => {
    setSaver({ style: 'alternate' })
    expect([nextSaverStyle(), nextSaverStyle(), nextSaverStyle()]).toEqual(['cellar', 'bottle', 'cellar'])
  })
})
