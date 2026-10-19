import { describe, expect, it } from 'vitest'
import { formatElapsed } from './transcript-format'

describe('formatElapsed', () => {
  it('formats elapsed time as MM:SS, then H:MM:SS past an hour', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_400)).toBe('01:05')
    expect(formatElapsed(3_599_000)).toBe('59:59')
    expect(formatElapsed(3_600_000 + 2 * 60_000 + 3_000)).toBe('1:02:03')
    expect(formatElapsed(-5)).toBe('00:00')
  })
})
