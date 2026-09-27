import { describe, expect, it } from 'vitest'
import { isTypingTarget } from './keyboard-shortcuts'

describe('isTypingTarget', () => {
  it.each(['input', 'textarea', 'select'])('recognises a %s', tag => {
    expect(isTypingTarget({ tagName: tag.toUpperCase() } as unknown as EventTarget)).toBe(true)
  })

  it('recognises editable content', () => {
    const element = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget
    expect(isTypingTarget(element)).toBe(true)
  })

  it('allows shortcuts on non-editable controls', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
