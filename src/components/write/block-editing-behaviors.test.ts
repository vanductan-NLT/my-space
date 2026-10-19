import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { writeExtensions } from './editor-extensions'
import { MAX_INDENT, moveTopLevelBlock, shiftIndent, topLevelBlockAt } from './block-editing-behaviors'

const schema = getSchema(writeExtensions)
const p = (text: string, attrs?: Record<string, unknown>) => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] })
const stateOf = (content: unknown[], caret = 1) => {
  const doc = schema.nodeFromJSON({ type: 'doc', content })
  return EditorState.create({ doc, selection: TextSelection.create(doc, caret) })
}
const texts = (state: EditorState) => state.doc.content.content.map(n => n.textContent)

describe('moving top-level blocks', () => {
  it('moves the block under the caret down and up, keeping the caret inside it', () => {
    const start = stateOf([p('A'), p('B'), p('C')], 2)
    const down = start.apply(moveTopLevelBlock(start, 0, 1)!)
    expect(texts(down)).toEqual(['B', 'A', 'C'])
    expect(topLevelBlockAt(down)?.node.textContent).toBe('A')

    const up = down.apply(moveTopLevelBlock(down, 1, -1)!)
    expect(texts(up)).toEqual(['A', 'B', 'C'])
  })

  it('does nothing past the first or last block', () => {
    const state = stateOf([p('A'), p('B')])
    expect(moveTopLevelBlock(state, 0, -1)).toBeNull()
    expect(moveTopLevelBlock(state, 1, 1)).toBeNull()
  })

  it('moves whole wrapper blocks such as toggles', () => {
    const toggle = { type: 'toggle', attrs: { open: true }, content: [p('Summary'), p('Body')] }
    const state = stateOf([p('A'), toggle], 2)
    const moved = state.apply(moveTopLevelBlock(state, 0, 1)!)
    expect(moved.doc.child(0).type.name).toBe('toggle')
    expect(moved.doc.child(1).textContent).toBe('A')
  })
})

describe('Tab indentation', () => {
  it('indents and outdents paragraphs within 0…MAX_INDENT', () => {
    let state = stateOf([p('A')])
    for (let i = 0; i < MAX_INDENT + 2; i++) {
      const tr = shiftIndent(state, 1)
      if (tr) state = state.apply(tr)
    }
    expect(state.doc.child(0).attrs.indent).toBe(MAX_INDENT)
    expect(shiftIndent(state, 1)).toBeNull()

    state = state.apply(shiftIndent(state, -1)!)
    expect(state.doc.child(0).attrs.indent).toBe(MAX_INDENT - 1)
  })

  it('returns null when outdenting an unindented block', () => {
    expect(shiftIndent(stateOf([p('A')]), -1)).toBeNull()
  })

  it('indents every text block in a multi-block selection', () => {
    const doc = schema.nodeFromJSON({ type: 'doc', content: [p('A'), p('B'), p('C')] })
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, doc.content.size - 1) })
    const next = state.apply(shiftIndent(state, 1)!)
    expect(next.doc.content.content.map(n => n.attrs.indent)).toEqual([1, 1, 1])
  })
})

describe('toggle block schema', () => {
  it('requires a paragraph summary and keeps its open state', () => {
    const toggle = schema.nodeFromJSON({ type: 'toggle', attrs: { open: false }, content: [p('Summary'), p('Hidden')] })
    expect(toggle.attrs.open).toBe(false)
    expect(() => schema.nodeFromJSON({ type: 'toggle', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'x' }] }] }).check()).toThrow()
  })
})
