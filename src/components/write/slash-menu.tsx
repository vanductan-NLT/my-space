'use client'

import type { Editor } from '@tiptap/react'
import {
  CheckSquare, Code, Heading1, Heading2, Heading3, Image as ImageIcon, List, ListOrdered, Minus, Quote, Table2, Type,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

/*
 * Notion-style block menu: type "/" at the start of a line or after a space,
 * keep typing to filter, ↑/↓ + Enter to pick, Esc to close.
 */

type Item = {
  title: string
  hint: string
  keywords: string
  icon: React.ReactNode
  run: (editor: Editor) => void
}

const ITEMS: Item[] = [
  { title: 'Text', hint: 'Plain paragraph', keywords: 'text paragraph plain p', icon: <Type size={16} />, run: e => e.chain().focus().setParagraph().run() },
  { title: 'Heading 1', hint: 'Big section title', keywords: 'h1 heading title', icon: <Heading1 size={16} />, run: e => e.chain().focus().setHeading({ level: 1 }).run() },
  { title: 'Heading 2', hint: 'Medium heading', keywords: 'h2 heading subtitle', icon: <Heading2 size={16} />, run: e => e.chain().focus().setHeading({ level: 2 }).run() },
  { title: 'Heading 3', hint: 'Small heading', keywords: 'h3 heading', icon: <Heading3 size={16} />, run: e => e.chain().focus().setHeading({ level: 3 }).run() },
  { title: 'Bulleted list', hint: 'Simple list', keywords: 'bullet list ul unordered', icon: <List size={16} />, run: e => e.chain().focus().toggleBulletList().run() },
  { title: 'Numbered list', hint: '1, 2, 3', keywords: 'number ordered list ol', icon: <ListOrdered size={16} />, run: e => e.chain().focus().toggleOrderedList().run() },
  { title: 'To-do list', hint: 'Checkboxes', keywords: 'todo task check checkbox', icon: <CheckSquare size={16} />, run: e => e.chain().focus().toggleTaskList().run() },
  { title: 'Quote', hint: 'Call out a passage', keywords: 'quote blockquote citation', icon: <Quote size={16} />, run: e => e.chain().focus().toggleBlockquote().run() },
  { title: 'Code', hint: 'Code block', keywords: 'code snippet pre', icon: <Code size={16} />, run: e => e.chain().focus().toggleCodeBlock().run() },
  { title: 'Divider', hint: 'Horizontal line', keywords: 'divider line hr separator', icon: <Minus size={16} />, run: e => e.chain().focus().setHorizontalRule().run() },
  { title: 'Table', hint: '3 × 3', keywords: 'table grid', icon: <Table2 size={16} />, run: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
]

type Open = { from: number; to: number; query: string; left: number; top: number; above: boolean }

export function SlashMenu({ editor, onPickImage }: { editor: Editor; onPickImage: () => void }) {
  const [open, setOpen] = useState<Open | null>(null)
  const [index, setIndex] = useState(0)
  const dismissedAt = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  const items: Item[] = [
    ...ITEMS,
    { title: 'Image', hint: 'Upload or paste', keywords: 'image picture photo img upload', icon: <ImageIcon size={16} />, run: () => onPickImage() },
  ]
  const q = open?.query.toLowerCase() ?? ''
  // Matches the English name, the translated name and the keywords.
  const matches = items.filter(i => !q || i.title.toLowerCase().includes(q) || t(i.title).toLowerCase().includes(q) || i.keywords.includes(q))

  // Watch the text before the caret for "/query".
  useEffect(() => {
    const update = () => {
      const { state, view } = editor
      const { selection } = state
      const { $from } = selection
      if (!selection.empty || !$from.parent.isTextblock || $from.parent.type.name === 'codeBlock' || !view.hasFocus()) {
        setOpen(null)
        return
      }
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
      const match = before.match(/(?:^|\s)\/([\p{L}\d-]{0,20})$/u)
      if (!match) {
        dismissedAt.current = null
        setOpen(null)
        return
      }
      const from = $from.pos - match[1].length - 1
      if (dismissedAt.current === from) return setOpen(null)
      const coords = view.coordsAtPos(from)
      const above = coords.bottom + 320 > window.innerHeight
      setOpen(prev => {
        if (prev?.query !== match[1]) setIndex(0)
        return { from, to: $from.pos, query: match[1], left: coords.left, top: above ? coords.top - 6 : coords.bottom + 6, above }
      })
    }
    editor.on('transaction', update)
    editor.on('blur', update)
    return () => {
      editor.off('transaction', update)
      editor.off('blur', update)
    }
  }, [editor])

  const pick = useCallback(
    (item: Item | undefined) => {
      if (!item || !open) return
      editor.chain().focus().deleteRange({ from: open.from, to: open.to }).run()
      setOpen(null)
      item.run(editor)
    },
    [editor, open]
  )

  // Keys are taken before ProseMirror sees them (capture on the editor's parent).
  useEffect(() => {
    const host = editor.view.dom.parentElement
    if (!host || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!matches.length) return
        e.preventDefault()
        e.stopPropagation()
        setIndex(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (!matches.length) return
        e.preventDefault()
        e.stopPropagation()
        pick(matches[Math.min(index, matches.length - 1)])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dismissedAt.current = open.from
        setOpen(null)
      }
    }
    host.addEventListener('keydown', onKey, true)
    return () => host.removeEventListener('keydown', onKey, true)
  }, [editor, open, matches, index, pick])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open || !matches.length) return null

  // Portalled: the workspace's backdrop-filter would offset a fixed menu.
  return createPortal(
    <div
      ref={listRef}
      className={`slash-menu ${open.above ? 'above' : ''}`}
      style={{ left: Math.min(open.left, window.innerWidth - 280), top: open.top }}
      role="listbox"
      aria-label={t('Insert block')}
      onMouseDown={e => e.preventDefault() /* keep the editor focused */}
    >
      <div className="slash-menu-title">{t('Blocks')}</div>
      {matches.map((item, i) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={i === Math.min(index, matches.length - 1)}
          className="slash-item"
          onMouseEnter={() => setIndex(i)}
          onClick={() => pick(item)}
        >
          <span className="slash-icon">{item.icon}</span>
          <span>
            <strong>{t(item.title)}</strong>
            <small>{t(item.hint)}</small>
          </span>
        </button>
      ))}
    </div>,
    document.body
  )
}
