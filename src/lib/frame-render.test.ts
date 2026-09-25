import { describe, expect, it } from 'vitest'
import { DEFAULT_FRAME, layout } from './frame-render'

describe('frame layout', () => {
  it('auto size wraps the image with padding on every side', () => {
    const L = layout(1000, 600, { ...DEFAULT_FRAME, padding: 50, chrome: 'none', scale: 100 })
    expect(L.width).toBeGreaterThan(1000)
    expect(L.width - 1000).toBeCloseTo(L.height - 600, 0)
    expect(L.box.x).toBeCloseTo((L.width - 1000) / 2)
  })

  it('fixed ratios are honoured', () => {
    for (const [size, ratio] of [['16:9', 16 / 9], ['1:1', 1], ['9:16', 9 / 16]] as const) {
      const L = layout(1200, 800, { ...DEFAULT_FRAME, size })
      expect(L.width / L.height).toBeCloseTo(ratio, 2)
    }
  })

  it('a window frame adds a title bar above the image', () => {
    const plain = layout(1000, 600, { ...DEFAULT_FRAME, chrome: 'none', padding: 0 })
    const framed = layout(1000, 600, { ...DEFAULT_FRAME, chrome: 'window-light', padding: 0 })
    expect(framed.bar).toBeGreaterThan(0)
    expect(framed.height).toBe(plain.height + framed.bar)
  })

  it('scale shrinks the image, not the canvas', () => {
    const full = layout(1000, 600, { ...DEFAULT_FRAME, scale: 100 })
    const half = layout(1000, 600, { ...DEFAULT_FRAME, scale: 50 })
    expect(half.width).toBe(full.width)
    expect(half.box.w).toBeCloseTo(full.box.w / 2)
  })
})
