import { describe, expect, it } from 'vitest'
import { markdownToHtml, toMarkdown } from './markdown'

const text = (t: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'text', text: t, marks })

describe('toMarkdown', () => {
  it('keeps headings, emphasis, links, lists and tasks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Plan')] },
        { type: 'paragraph', content: [text('Read '), text('this', [{ type: 'bold' }]), text(' at '), text('site', [{ type: 'link', attrs: { href: 'https://nhi.sg' } }])] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] }] },
        { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('first')] }] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [text('done')] }] }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [text('quoted')] }] },
      ],
    }
    expect(toMarkdown(doc)).toBe('## Plan\n\nRead **this** at [site](https://nhi.sg)\n\n- one\n\n1. first\n\n- [x] done\n\n> quoted\n')
  })

  it('writes tables as GFM tables', () => {
    const cell = (t: string) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [text(t)] }] })
    const doc = { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [cell('A'), cell('B')] }, { type: 'tableRow', content: [cell('1'), cell('2')] }] }] }
    expect(toMarkdown(doc)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n')
  })
})

describe('markdownToHtml', () => {
  it('converts the common blocks', () => {
    const html = markdownToHtml('# Title\n\nSome **bold** and *it*.\n\n- a\n- b\n\n1. x\n\n- [ ] todo\n\n> q')
    expect(html).toBe('<h1>Title</h1><p>Some <strong>bold</strong> and <em>it</em>.</p><ul><li><p>a</p></li><li><p>b</p></li></ul><ol><li><p>x</p></li></ol><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>todo</p></li></ul><blockquote><p>q</p></blockquote>')
  })

  it('round-trips images', () => {
    const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: 'data:image/png;base64,AAAA', alt: 'shot' } }] }
    expect(toMarkdown(doc)).toBe('![shot](data:image/png;base64,AAAA)\n')
    expect(markdownToHtml('![shot](data:image/png;base64,AAAA)')).toBe('<img src="data:image/png;base64,AAAA" alt="shot">')
    expect(markdownToHtml('![x](javascript:alert)')).not.toContain('<img')
  })

  it('escapes HTML and drops unsafe links', () => {
    expect(markdownToHtml('<script>x</script> [a](javascript:alert)')).toBe('<p>&lt;script&gt;x&lt;/script&gt; a</p>')
  })
})
