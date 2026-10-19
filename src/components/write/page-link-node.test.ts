import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { writeExtensions } from './editor-extensions'
import { insertPageLink, withLivePageLinkTitles } from './page-link-node'
import { toMarkdown } from '@/lib/markdown'

const schema = getSchema(writeExtensions)
const p = (text?: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined })
const stateOf = (content: unknown[], caret: number) => {
  const doc = schema.nodeFromJSON({ type: 'doc', content })
  return EditorState.create({ doc, selection: TextSelection.create(doc, caret) })
}
const types = (state: EditorState) => state.doc.content.content.map(n => n.type.name)

describe('inserting a page link', () => {
  it('replaces an empty line and leaves a paragraph to keep writing in', () => {
    const state = stateOf([p('Intro'), p()], 8)
    const next = state.apply(insertPageLink(state, { pageId: 'child', title: 'Child' })!)
    expect(types(next)).toEqual(['paragraph', 'pageLink', 'paragraph'])
    expect(next.doc.child(1).attrs).toMatchObject({ pageId: 'child', title: 'Child' })
    expect(next.selection.$from.parent.type.name).toBe('paragraph')
    expect(next.selection.from).toBeGreaterThan(8)
  })

  it('goes after the current block when the line has text', () => {
    const state = stateOf([p('Intro'), p('Outro')], 3)
    const next = state.apply(insertPageLink(state, { pageId: 'x', title: 'X' })!)
    expect(types(next)).toEqual(['paragraph', 'pageLink', 'paragraph'])
    expect(next.doc.child(0).textContent).toBe('Intro')
    expect(next.doc.child(2).textContent).toBe('Outro')
  })
})

describe('page links in exports', () => {
  const doc = { type: 'doc', content: [{ type: 'pageLink', attrs: { pageId: 'a', title: 'Old name' } }, p('after')] }

  it('uses the linked page’s current title', () => {
    const live = withLivePageLinkTitles(doc, id => (id === 'a' ? 'New name' : undefined))
    expect(live.content?.[0].attrs?.title).toBe('New name')
    expect(withLivePageLinkTitles(doc, () => undefined).content?.[0].attrs?.title).toBe('Old name')
  })

  it('serializes to HTML carrying the page id and parses back from it', () => {
    const type = schema.nodes.pageLink
    const [tag, attrs] = type.spec.toDOM!(type.create({ pageId: 'a', title: 'Old name' })) as [string, Record<string, string>]
    expect(tag).toBe('div')
    expect(attrs).toMatchObject({ 'data-type': 'page-link', 'data-page-id': 'a', 'data-title': 'Old name' })
    expect(type.spec.parseDOM?.[0].tag).toBe('div[data-type="page-link"]')
  })

  it('writes readable Markdown', () => {
    expect(toMarkdown(doc)).toBe('📄 Old name\n\nafter\n')
  })
})
