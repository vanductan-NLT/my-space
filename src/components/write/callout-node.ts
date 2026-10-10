import { mergeAttributes, Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      toggleCallout: () => ReturnType
      setCallout: () => ReturnType
    }
  }
}

/**
 * Notion-style Callout block with an icon and tinted background box.
 */
export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: '💡',
        parseHTML: element => element.getAttribute('data-icon') || '💡',
        renderHTML: attributes => ({
          'data-icon': attributes.icon || '💡',
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        class: 'notion-callout',
      }),
      ['span', { class: 'callout-icon', contenteditable: 'false' }, HTMLAttributes['data-icon'] || '💡'],
      ['div', { class: 'callout-body' }, 0],
    ]
  },

  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      setCallout:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
    }
  },
})
