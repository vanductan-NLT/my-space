import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/*
 * Notion-style live transcript inside the page. While voice typing, the words
 * still being recognised are drawn in grey at the spot where text is going
 * (the "anchor"); they are only a decoration, never saved. Finalised words are
 * inserted at the anchor, and the anchor follows every edit so typing elsewhere
 * doesn't break it.
 */

export type LiveTranscriptState = { anchor: number | null; text: string; listening: boolean }

type Meta = { anchor?: number | null; text?: string; listening?: boolean }

export const liveTranscriptKey = new PluginKey<LiveTranscriptState>('liveTranscript')

export const getLiveTranscript = (state: EditorState): LiveTranscriptState =>
  liveTranscriptKey.getState(state) ?? { anchor: null, text: '', listening: false }

/** The plugin behind the extension; exported so it can be tested without an editor. */
export const createLiveTranscriptPlugin = (label: () => string) =>
  new Plugin<LiveTranscriptState>({
    key: liveTranscriptKey,
    state: {
      init: () => ({ anchor: null, text: '', listening: false }),
      apply: (tr, value) => {
        const meta = tr.getMeta(liveTranscriptKey) as Meta | undefined
        // Text inserted exactly at the anchor lands before it (assoc 1), so the anchor stays at the end.
        let anchor = value.anchor === null ? null : tr.mapping.map(value.anchor, 1)
        if (anchor !== null && (anchor < 0 || anchor > tr.doc.content.size)) anchor = null
        const next = { ...value, anchor }
        if (meta) Object.assign(next, meta)
        return next
      },
    },
    props: {
      decorations: state => {
        const { anchor, text, listening } = getLiveTranscript(state)
        if (anchor === null || !listening) return null
        const widget = Decoration.widget(
          anchor,
          () => {
            const span = document.createElement('span')
            span.className = `live-transcript-preview ${text ? '' : 'idle'}`
            span.setAttribute('aria-live', 'polite')
            span.textContent = text ? ` ${text}` : ` ${label()}`
            return span
          },
          { side: 1, key: `live-${text}`, ignoreSelection: true }
        )
        return DecorationSet.create(state.doc, [widget])
      },
    },
  })

export const LiveTranscriptPreview = Extension.create<{ listeningLabel: () => string }>({
  name: 'liveTranscriptPreview',

  addOptions() {
    return { listeningLabel: () => 'Listening…' }
  },

  addProseMirrorPlugins() {
    return [createLiveTranscriptPlugin(this.options.listeningLabel)]
  },
})
