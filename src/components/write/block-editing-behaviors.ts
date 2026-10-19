import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'

/*
 * Small Notion-like editing behaviours that don't belong to any one block:
 * - there is always an empty paragraph after a trailing callout/table/image/toggle,
 *   so you can click or arrow below it and keep writing;
 * - the placeholder hides while an IME is composing;
 * - Alt+Shift+↑/↓ moves the current top-level block up or down;
 * - Tab / Shift+Tab indent and outdent: list items nest (Tiptap's list keymap
 *   runs first), code blocks get two spaces, other text blocks get an indent
 *   level. Tab never moves focus out of the editor, as in Notion.
 */

export const MAX_INDENT = 6
const INDENTABLE = ['paragraph', 'heading']

/** Position and size of the top-level block that contains the selection head. */
export const topLevelBlockAt = (state: EditorState, pos = state.selection.$head.pos) => {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    const node = state.doc.nodeAt(pos)
    return node ? { pos, node, index: $pos.index(0) } : null
  }
  return { pos: $pos.before(1), node: $pos.node(1), index: $pos.index(0) }
}

/** Swaps the block at `index` with its neighbour; keeps the caret inside the moved block. */
export const moveTopLevelBlock = (state: EditorState, index: number, dir: -1 | 1): Transaction | null => {
  const doc = state.doc
  const target = index + dir
  if (target < 0 || target >= doc.childCount) return null
  let start = 0
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize
  const node = doc.child(index)
  const neighbour = doc.child(target)
  const offsetInBlock = Math.max(0, state.selection.head - start)
  const tr = state.tr.delete(start, start + node.nodeSize)
  const insertAt = dir === -1 ? start - neighbour.nodeSize : start + neighbour.nodeSize
  tr.insert(insertAt, node)
  const caret = Math.min(insertAt + offsetInBlock, insertAt + node.nodeSize - 1)
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(caret)))
  } catch {
    // Atom blocks have no text position; leaving the mapped selection is fine.
  }
  return tr.scrollIntoView()
}

/** Changes the indent level of every paragraph/heading in the selection; null when nothing changes. */
export const shiftIndent = (state: EditorState, delta: 1 | -1): Transaction | null => {
  const { from, to } = state.selection
  const tr = state.tr
  let changed = false
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!INDENTABLE.includes(node.type.name)) return true
    const current = (node.attrs.indent as number) ?? 0
    const next = Math.max(0, Math.min(MAX_INDENT, current + delta))
    if (next !== current) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
      changed = true
    }
    return false
  })
  return changed ? tr : null
}

export const BlockEditingBehaviors = Extension.create({
  name: 'blockEditingBehaviors',
  // Lower than the list extensions (100), so their Tab/Shift-Tab win inside lists.
  priority: 90,

  addGlobalAttributes() {
    return [
      {
        types: INDENTABLE,
        attributes: {
          indent: {
            default: 0,
            parseHTML: element => Math.min(MAX_INDENT, Number(element.getAttribute('data-indent')) || 0),
            renderHTML: attributes => (attributes.indent ? { 'data-indent': attributes.indent, style: `margin-left: ${attributes.indent * 1.6}em` } : {}),
          },
        },
      },
    ]
  },

  addKeyboardShortcuts() {
    const indent = (delta: 1 | -1) => () => {
      const { state, view } = this.editor
      if (this.editor.isActive('codeBlock')) {
        if (delta === 1) return this.editor.commands.insertContent('  ')
        return true
      }
      // Tables have their own Tab (next cell); leave them alone.
      if (this.editor.isActive('table')) return false
      // A list item that can't nest further (e.g. the first one) just stays put.
      if (this.editor.isActive('listItem') || this.editor.isActive('taskItem')) return true
      const tr = shiftIndent(state, delta)
      if (tr) view.dispatch(tr)
      // Swallow the key even when nothing changed, so focus stays in the editor.
      return true
    }
    const move = (dir: -1 | 1) => () => {
      const { state, view } = this.editor
      const block = topLevelBlockAt(state)
      const tr = block && moveTopLevelBlock(state, block.index, dir)
      if (!tr) return false
      view.dispatch(tr)
      return true
    }
    return { 'Alt-Shift-ArrowUp': move(-1), 'Alt-Shift-ArrowDown': move(1), Tab: indent(1), 'Shift-Tab': indent(-1) }
  },

  addProseMirrorPlugins() {
    return [
      // While an IME (e.g. Vietnamese Telex) composes, the document isn't updated yet,
      // so the empty-line placeholder would overlap the letters being typed. CSS hides
      // the placeholder while this class is on the editor.
      new Plugin({
        key: new PluginKey('compositionClass'),
        props: {
          handleDOMEvents: {
            compositionstart: view => {
              view.dom.classList.add('is-composing')
              return false
            },
            compositionend: view => {
              view.dom.classList.remove('is-composing')
              return false
            },
            blur: view => {
              view.dom.classList.remove('is-composing')
              return false
            },
          },
        },
      }),
      new Plugin({
        key: new PluginKey('trailingParagraph'),
        appendTransaction: (_trs, _old, state) => {
          const last = state.doc.lastChild
          if (last && last.type.name === 'paragraph') return null
          const paragraph = state.schema.nodes.paragraph
          return paragraph ? state.tr.insert(state.doc.content.size, paragraph.create()) : null
        },
      }),
    ]
  },
})
