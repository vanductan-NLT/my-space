import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'

/*
 * Where voice-typed text goes, as plain transactions (testable without a DOM).
 * A transcript is a run of paragraphs, each optionally starting with an elapsed
 * time stamp in monospace ("01:35"), like Notion's meeting transcripts.
 */

const stampNodes = (state: EditorState, stamp: string | null): PMNode[] => {
  const code = state.schema.marks.code
  return stamp && code ? [state.schema.text(stamp, [code.create()])] : []
}

/**
 * Prepares the spot for a new voice session: the empty line under the caret, or
 * a new paragraph right after the caret's line. Returns the transaction and the
 * anchor (where words will be added).
 */
export function beginVoiceTranscript(state: EditorState, stamp: string | null): { tr: Transaction; anchor: number } {
  const tr = state.tr
  const { $from } = state.selection
  const stamped = stampNodes(state, stamp)

  if ($from.parent.isTextblock && $from.parent.content.size === 0 && $from.parent.type.name === 'paragraph') {
    tr.insert($from.pos, stamped)
    return { tr, anchor: $from.pos + stamped.reduce((n, s) => n + s.nodeSize, 0) }
  }

  const at = $from.parent.isTextblock ? $from.after() : state.doc.content.size
  const paragraph = state.schema.nodes.paragraph.create(null, stamped)
  tr.insert(at, paragraph)
  return { tr, anchor: at + 1 + paragraph.content.size }
}

/**
 * Adds finalised words at the anchor. `newParagraph` starts a fresh paragraph
 * (with `stamp`, when given) after the anchor's line instead. Returns the
 * transaction and the new anchor, or null when the anchor no longer points into text.
 */
export function addVoiceText(
  state: EditorState,
  anchor: number,
  text: string,
  { newParagraph, stamp }: { newParagraph: boolean; stamp: string | null }
): { tr: Transaction; anchor: number } | null {
  const clean = text.trim()
  if (!clean || anchor < 0 || anchor > state.doc.content.size) return null
  const $a = state.doc.resolve(anchor)
  if (!$a.parent.isTextblock) return null
  const tr = state.tr

  if (newParagraph) {
    const stamped = stampNodes(state, stamp)
    const words = state.schema.text(stamped.length ? ` ${clean}` : clean)
    const paragraph = state.schema.nodes.paragraph.create(null, [...stamped, words])
    const at = $a.after()
    tr.insert(at, paragraph)
    return { tr, anchor: at + 1 + paragraph.content.size }
  }

  // A space separates new words from what is already on the line (a stamp or earlier words).
  const before = $a.parentOffset > 0 ? state.doc.textBetween(anchor - 1, anchor, undefined, ' ') : ''
  const words = state.schema.text(before && !/\s/.test(before) ? ` ${clean}` : clean)
  tr.insert(anchor, words)
  return { tr, anchor: anchor + words.nodeSize }
}
