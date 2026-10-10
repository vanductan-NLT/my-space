'use client'

import type { Editor } from '@tiptap/react'
import { GoogleIcon } from '../google-icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

/*
 * Block menu: type "/" at the start of a line or after a space,
 * keep typing to filter, ↑/↓ + Enter to pick, Esc to close.
 */

type Item = {
  category?: string
  title: string
  hint: string
  keywords: string
  icon: React.ReactNode
  run: (editor: Editor) => void
}

const ITEMS: Item[] = [
  { category: 'Basic blocks', title: 'Text', hint: 'Plain paragraph', keywords: 'text paragraph plain p chu doan van', icon: <GoogleIcon name="notes" size={18} />, run: e => e.chain().focus().setParagraph().run() },
  { category: 'Basic blocks', title: 'Heading 1', hint: 'Big section title', keywords: 'h1 heading title tieu de 1 lon', icon: <GoogleIcon name="format_h1" size={18} />, run: e => e.chain().focus().setHeading({ level: 1 }).run() },
  { category: 'Basic blocks', title: 'Heading 2', hint: 'Medium heading', keywords: 'h2 heading subtitle tieu de 2 vua', icon: <GoogleIcon name="format_h2" size={18} />, run: e => e.chain().focus().setHeading({ level: 2 }).run() },
  { category: 'Basic blocks', title: 'Heading 3', hint: 'Small heading', keywords: 'h3 heading tieu de 3 nho', icon: <GoogleIcon name="format_h3" size={18} />, run: e => e.chain().focus().setHeading({ level: 3 }).run() },
  { category: 'Basic blocks', title: 'To-do list', hint: 'Checkboxes for tasks', keywords: 'todo task check checkbox danh sach viec cong viec', icon: <GoogleIcon name="check_box" size={18} />, run: e => e.chain().focus().toggleTaskList().run() },
  { category: 'Basic blocks', title: 'Bulleted list', hint: 'Simple bulleted list', keywords: 'bullet list ul unordered danh sach cham', icon: <GoogleIcon name="format_list_bulleted" size={18} />, run: e => e.chain().focus().toggleBulletList().run() },
  { category: 'Basic blocks', title: 'Numbered list', hint: '1, 2, 3 ordered list', keywords: 'number ordered list ol danh sach so', icon: <GoogleIcon name="format_list_numbered" size={18} />, run: e => e.chain().focus().toggleOrderedList().run() },
  { category: 'Basic blocks', title: 'Quote', hint: 'Call out a passage', keywords: 'quote blockquote citation trich dan', icon: <GoogleIcon name="format_quote" size={18} />, run: e => e.chain().focus().toggleBlockquote().run() },
  { category: 'Basic blocks', title: 'Divider', hint: 'Horizontal line', keywords: 'divider line hr separator duong ke', icon: <GoogleIcon name="horizontal_rule" size={18} />, run: e => e.chain().focus().setHorizontalRule().run() },
  { category: 'Advanced blocks', title: 'Callout', hint: 'Highlight note box or tip', keywords: 'callout note box hop ghi chu luu y tip warning alert', icon: <GoogleIcon name="lightbulb" size={18} />, run: e => e.chain().focus().toggleCallout().run() },
  { category: 'Advanced blocks', title: 'Code', hint: 'Code snippet with syntax block', keywords: 'code snippet pre ma lap trinh', icon: <GoogleIcon name="code" size={18} />, run: e => e.chain().focus().toggleCodeBlock().run() },
  { category: 'Advanced blocks', title: 'Table', hint: '3 × 3 spreadsheet table', keywords: 'table grid bang du lieu', icon: <GoogleIcon name="table_chart" size={18} />, run: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
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
    { category: 'Advanced blocks', title: 'Image', hint: 'Upload or paste', keywords: 'image picture photo img upload hinh anh', icon: <GoogleIcon name="image" size={18} />, run: () => onPickImage() },
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
      const above = coords.bottom + 360 > window.innerHeight
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

  let lastCategory = ''

  return createPortal(
    <div
      ref={listRef}
      className={`slash-menu ${open.above ? 'above' : ''}`}
      style={{ left: Math.min(open.left, window.innerWidth - 300), top: open.top }}
      role="listbox"
      aria-label={t('Insert block')}
      onMouseDown={e => e.preventDefault() /* keep the editor focused */}
    >
      <div className="slash-menu-title">{t('Blocks')}</div>
      {matches.map((item, i) => {
        const isNewCategory = item.category && item.category !== lastCategory
        if (isNewCategory) lastCategory = item.category!
        return (
          <div key={item.title}>
            {isNewCategory && <div className="slash-category-header">{t(item.category!)}</div>}
            <button
              type="button"
              role="option"
              aria-selected={i === Math.min(index, matches.length - 1)}
              className="slash-item"
              onMouseEnter={() => setIndex(i)}
              onClick={() => pick(item)}
            >
              <span className="slash-icon">{item.icon}</span>
              <span className="slash-item-details">
                <strong>{t(item.title)}</strong>
                <small>{t(item.hint)}</small>
              </span>
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
