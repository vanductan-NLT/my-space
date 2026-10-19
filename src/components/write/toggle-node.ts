import { mergeAttributes, Node } from '@tiptap/core'
import { liftTarget } from '@tiptap/pm/transform'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggleBlock: {
      /** Wraps the current block in a collapsible toggle (first line = summary). */
      setToggle: () => ReturnType
    }
  }
}

/**
 * Notion-style toggle list. The first paragraph is the always-visible summary;
 * everything after it folds away when the arrow is clicked. Open/closed state
 * is stored on the node so it survives reloads and exports.
 */
export const ToggleNode = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: element => element.getAttribute('data-open') !== 'false',
        renderHTML: attributes => ({ 'data-open': attributes.open ? 'true' : 'false' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toggle', class: 'toggle-block' }), ['div', { class: 'toggle-content' }, 0]]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      const dom = document.createElement('div')
      dom.className = 'toggle-block'
      dom.dataset.type = 'toggle'

      const arrow = document.createElement('button')
      arrow.type = 'button'
      arrow.className = 'toggle-arrow'
      arrow.contentEditable = 'false'
      arrow.setAttribute('aria-label', 'Toggle')
      arrow.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">arrow_right</span>'
      // Keep the caret where it is; flipping the attribute is the whole action.
      arrow.addEventListener('mousedown', e => e.preventDefault())
      arrow.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, open: !current.attrs.open }))
      })

      const content = document.createElement('div')
      content.className = 'toggle-content'
      dom.append(arrow, content)

      const sync = () => {
        dom.dataset.open = current.attrs.open ? 'true' : 'false'
        arrow.setAttribute('aria-expanded', String(!!current.attrs.open))
      }
      sync()

      return {
        dom,
        contentDOM: content,
        update: updated => {
          if (updated.type !== current.type) return false
          current = updated
          sync()
          return true
        },
        // The arrow is UI, not document content.
        ignoreMutation: mutation => mutation.target === arrow || arrow.contains(mutation.target as globalThis.Node),
      }
    }
  },

  addCommands() {
    return {
      setToggle:
        () =>
        ({ chain }) =>
          chain().setParagraph().wrapIn(this.name).run(),
    }
  },

  addKeyboardShortcuts() {
    const inToggle = () => {
      const { $from, empty } = this.editor.state.selection
      if (!empty || $from.depth < 2) return null
      const toggle = $from.node(-1)
      if (toggle.type.name !== this.name) return null
      return { $from, toggle, index: $from.index(-1) }
    }
    return {
      // Backspace at the start of the summary unwraps the whole toggle back to plain blocks.
      Backspace: () => {
        const ctx = inToggle()
        if (!ctx || ctx.index !== 0 || ctx.$from.parentOffset !== 0) return false
        const { state, view } = this.editor
        const range = state.doc.resolve(ctx.$from.start(-1)).blockRange(state.doc.resolve(ctx.$from.end(-1)))
        const target = range && liftTarget(range)
        if (!range || target == null) return false
        view.dispatch(state.tr.lift(range, target))
        return true
      },
      // Enter on an empty last line inside the toggle steps out of it (like lists).
      Enter: () => {
        const ctx = inToggle()
        if (!ctx || ctx.index === 0 || ctx.$from.parent.content.size || ctx.index !== ctx.toggle.childCount - 1) return false
        return this.editor.commands.lift(this.name)
      },
    }
  },
})
