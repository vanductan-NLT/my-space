import type { JSONContent } from '@tiptap/react'

/** Elapsed meeting time as "MM:SS", or "H:MM:SS" from the first hour on. */
export const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

/** One transcript line: the elapsed time in monospace, then what was said. */
export const transcriptParagraph = (elapsedMs: number, text: string): JSONContent => ({
  type: 'paragraph',
  content: [
    { type: 'text', text: formatElapsed(elapsedMs), marks: [{ type: 'code' }] },
    { type: 'text', text: ` ${text}` },
  ],
})

/** "1 h 05 min" / "12 min" / "40 s" for summaries. */
export const formatDuration = (ms: number, lang: 'vi' | 'en') => {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (!h && !m) return lang === 'vi' ? `${total} giây` : `${total} s`
  const min = lang === 'vi' ? 'phút' : 'min'
  return h ? `${h} ${lang === 'vi' ? 'giờ' : 'h'} ${String(m).padStart(2, '0')} ${min}` : `${m} ${min}`
}

/** Appends blocks to a stored document, dropping the lone empty paragraph a new page starts with. */
export const appendBlocks = (content: JSONContent, blocks: JSONContent[]): JSONContent => {
  const existing = content.content ?? []
  const onlyEmpty = existing.length === 1 && existing[0].type === 'paragraph' && !existing[0].content?.length
  return { ...content, type: 'doc', content: [...(onlyEmpty ? [] : existing), ...blocks] }
}
