import { describe, expect, it } from 'vitest'
import { accentCss, luminance, resolveAccent } from './accent'

describe('accent colour', () => {
  it('the default needs no override', () => expect(accentCss('mint')).toBe(''))

  it('presets use their tuned shade per theme', () => {
    const css = accentCss('sky')
    expect(css).toContain('--mint:#8ecbff')
    expect(css).toContain('[data-theme="light"]{--mint:#1f74cc')
  })

  it('a custom colour is made bright enough for dark and deep enough for light', () => {
    const { dark, light } = resolveAccent('#3355aa')
    expect(luminance(dark)).toBeGreaterThanOrEqual(0.4)
    expect(luminance(light)).toBeLessThanOrEqual(0.2)
  })

  it('text on the accent stays readable', () => {
    expect(accentCss('#ffff66')).toContain('--mint-contrast:#0d1711')
    expect(accentCss('graphite')).toContain('[data-theme="light"]{--mint:#3f3f46;--mint-strong:#3f3f46;--mint-soft:rgba(63,63,70,0.13);--mint-border:rgba(63,63,70,0.26);--mint-contrast:#ffffff')
  })

  it('falls back to the default for unknown values', () => expect(resolveAccent('nope')).toEqual(resolveAccent('mint')))
})
