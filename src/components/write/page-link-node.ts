import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer, type JSONContent } from '@tiptap/react'
import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { PageLinkView } from './page-link-view'

/**
 * Notion-style link to another page, shown as its own block. `pageId` points
 * at the page; `title` is a snapshot used only where the live title can't be
 * looked up (HTML export, copy to other apps). In the editor the block always
 * shows the page's current icon and title (see page-link-view.tsx).
 */
export const PageLinkNode = Node.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: element => element.getAttribute('data-page-id'),
        renderHTML: attributes => ({ 'data-page-id': attributes.pageId }),
      },
      title: {
        default: '',
        parseHTML: element => element.getAttribute('data-title') ?? element.textContent ?? '',
        renderHTML: attributes => ({ 'data-title': attributes.title }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="page-link"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'page-link', class: 'page-link-block' }),
      ['a', { href: `#page-${node.attrs.pageId ?? ''}` }, `📄 ${node.attrs.title || 'Untitled'}`],
    ]
  },

  renderText({ node }) {
    return `📄 ${node.attrs.title || 'Untitled'}`
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView)
  },
})

/**
 * Inserts a page link at the caret. An empty line is replaced by the link (as
 * Notion does); otherwise the link goes after the current top-level block. An
 * empty paragraph follows when the link would be the last block, so writing
 * can go on below it. Returns null when the schema has no page links.
 */
export function insertPageLink(state: EditorState, attrs: { pageId: string; title: string }): Transaction | null {
  const type = state.schema.nodes.pageLink
  if (!type) return null
  const { $from } = state.selection
  const link = type.create(attrs)
  const tr = state.tr
  let after: number
  if ($from.depth === 1 && $from.parent.isTextblock && $from.parent.content.size === 0) {
    const from = $from.before(1)
    tr.replaceWith(from, $from.after(1), link)
    after = from + link.nodeSize
  } else {
    const at = $from.depth >= 1 ? $from.after(1) : $from.pos
    tr.insert(at, link)
    after = at + link.nodeSize
  }
  if (after >= tr.doc.content.size) tr.insert(after, state.schema.nodes.paragraph.create())
  return tr.setSelection(Selection.near(tr.doc.resolve(after), 1)).scrollIntoView()
}

/** Copy of a document where every page link carries the linked page's current title. */
export function withLivePageLinkTitles(doc: JSONContent, titleFor: (pageId: string) => string | undefined): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === 'pageLink') {
      const title = titleFor(node.attrs?.pageId ?? '')
      return title === undefined ? node : { ...node, attrs: { ...node.attrs, title } }
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node
  }
  return walk(doc)
}
