import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { writeExtensions } from './editor-extensions'
import { addVoiceText, beginVoiceTranscript } from './voice-transcript-insert'
import { createLiveTranscriptPlugin, getLiveTranscript, liveTranscriptKey } from './live-transcript-preview'

const schema = getSchema(writeExtensions)
const p = (text?: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined })
const stateOf = (content: unknown[], caret: number) => {
  const doc = schema.nodeFromJSON({ type: 'doc', content })
  return EditorState.create({ doc, selection: TextSelection.create(doc, caret) })
}
/** Paragraph texts, with code-marked stamps shown as [mm:ss]. */
const lines = (state: EditorState) =>
  state.doc.content.content.map(n => {
    let out = ''
    n.forEach(child => {
      out += child.marks.some(m => m.type.name === 'code') ? `[${child.text}]` : child.text ?? ''
    })
    return out
  })

describe('voice transcript insertion', () => {
  it('starts on the empty line under the caret, with a time stamp', () => {
    const state = stateOf([p('Notes'), p()], 8)
    const { tr, anchor } = beginVoiceTranscript(state, '00:00')
    const next = state.apply(tr)
    expect(lines(next)).toEqual(['Notes', '[00:00]'])
    expect(anchor).toBe(next.doc.content.size - 1)
  })

  it('opens a new paragraph after a line that already has text', () => {
    const state = stateOf([p('Agenda')], 3)
    const { tr } = beginVoiceTranscript(state, null)
    expect(lines(state.apply(tr))).toEqual(['Agenda', ''])
  })

  it('adds words to the same paragraph, separated by spaces', () => {
    let state = stateOf([p()], 1)
    const begun = beginVoiceTranscript(state, '00:00')
    state = state.apply(begun.tr)
    let r = addVoiceText(state, begun.anchor, 'xin chào', { newParagraph: false, stamp: null })!
    state = state.apply(r.tr)
    r = addVoiceText(state, r.anchor, 'mọi người', { newParagraph: false, stamp: null })!
    state = state.apply(r.tr)
    expect(lines(state)).toEqual(['[00:00] xin chào mọi người'])
  })

  it('starts a new time-stamped paragraph when asked', () => {
    let state = stateOf([p()], 1)
    const begun = beginVoiceTranscript(state, '00:00')
    state = state.apply(begun.tr)
    let r = addVoiceText(state, begun.anchor, 'one', { newParagraph: false, stamp: null })!
    state = state.apply(r.tr)
    r = addVoiceText(state, r.anchor, 'two', { newParagraph: true, stamp: '00:31' })!
    state = state.apply(r.tr)
    r = addVoiceText(state, r.anchor, 'three', { newParagraph: false, stamp: null })!
    state = state.apply(r.tr)
    expect(lines(state)).toEqual(['[00:00] one', '[00:31] two three'])
  })

  it('does not let new words inherit the stamp’s code style', () => {
    let state = stateOf([p()], 1)
    const begun = beginVoiceTranscript(state, '00:00')
    state = state.apply(begun.tr)
    state = state.apply(addVoiceText(state, begun.anchor, 'plain', { newParagraph: false, stamp: null })!.tr)
    const para = state.doc.child(0)
    expect(para.childCount).toBe(2)
    expect(para.child(1).marks).toEqual([])
  })

  it('ignores empty text and anchors outside text', () => {
    const state = stateOf([p('a')], 1)
    expect(addVoiceText(state, 1, '   ', { newParagraph: false, stamp: null })).toBeNull()
    expect(addVoiceText(state, 99, 'x', { newParagraph: false, stamp: null })).toBeNull()
  })
})

describe('live transcript anchor', () => {
  it('follows edits made before it and stays after inserted words', () => {
    const doc = schema.nodeFromJSON({ type: 'doc', content: [p('ab')] })
    let state = EditorState.create({ doc, plugins: [createLiveTranscriptPlugin(() => 'Listening…')] })
    state = state.apply(state.tr.setMeta(liveTranscriptKey, { anchor: 3, text: 'đang nói', listening: true }))
    // Typing at the start of the line shifts the anchor right.
    state = state.apply(state.tr.insertText('X', 1))
    expect(getLiveTranscript(state).anchor).toBe(4)
    // Words inserted exactly at the anchor end up before it.
    state = state.apply(state.tr.insertText('cd', 4))
    expect(getLiveTranscript(state)).toMatchObject({ anchor: 6, text: 'đang nói', listening: true })
  })
})
