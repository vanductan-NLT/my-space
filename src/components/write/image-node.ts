import { mergeAttributes, Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      insertImage: (attrs: { src: string; alt?: string }) => ReturnType
    }
  }
}

/** A block image. Small enough not to need @tiptap/extension-image. */
export const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'doc-image', draggable: 'true' })]
  },

  addCommands() {
    return {
      insertImage:
        attrs =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})
