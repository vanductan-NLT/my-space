'use client'

import type { Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Ban, CheckSquare, ChevronDown, Code2, Heading1, Heading2, Heading3, List,
  ListOrdered, Quote, RemoveFormatting, Subscript, Superscript, Type,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'

/*
 * The richer formatting shared by the selection bar (desktop) and the keyboard
 * bar (phones): turn into, colour, highlight, size, alignment, super/subscript.
 * Colours are mid-tones / translucent so they read in light and dark themes.
 */

export const TEXT_COLORS = [
  { name: 'Gray', value: '#8a8a85' },
  { name: 'Brown', value: '#a66f52' },
  { name: 'Orange', value: '#e07b24' },
  { name: 'Yellow', value: '#c99a1c' },
  { name: 'Green', value: '#3f9a6a' },
  { name: 'Blue', value: '#3a86c4' },
  { name: 'Purple', value: '#8f63c9' },
  { name: 'Pink', value: '#d1508f' },
  { name: 'Red', value: '#dc4b44' },
]

export const HIGHLIGHTS = [
  { name: 'Gray', value: 'rgba(140, 140, 135, 0.28)' },
  { name: 'Brown', value: 'rgba(166, 111, 82, 0.28)' },
  { name: 'Orange', value: 'rgba(240, 140, 50, 0.3)' },
  { name: 'Yellow', value: 'rgba(245, 200, 40, 0.38)' },
  { name: 'Green', value: 'rgba(70, 180, 110, 0.3)' },
  { name: 'Blue', value: 'rgba(60, 140, 220, 0.3)' },
  { name: 'Purple', value: 'rgba(150, 100, 220, 0.3)' },
  { name: 'Pink', value: 'rgba(230, 90, 160, 0.3)' },
  { name: 'Red', value: 'rgba(230, 80, 70, 0.3)' },
]

export const SIZES = [
  { name: 'Small', value: '14px' },
  { name: 'Normal', value: null },
  { name: 'Large', value: '21px' },
  { name: 'Huge', value: '28px' },
]

const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault()

export function ColorPanel({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  const current = editor.getAttributes('textStyle').color as string | undefined
  const currentBg = editor.getAttributes('highlight').color as string | undefined
  return (
    <div className="fmt-panel">
      <div className="fmt-label">{t('Text colour')}</div>
      <div className="fmt-swatches">
        <button type="button" className="fmt-swatch" onMouseDown={keep} onClick={() => editor.chain().focus().unsetColor().run()} aria-pressed={!current} title={t('Default')} aria-label={t('Default')}>
          <span className="fmt-a">A</span>
        </button>
        {TEXT_COLORS.map(c => (
          <button key={c.value} type="button" className="fmt-swatch" onMouseDown={keep} onClick={() => editor.chain().focus().setColor(c.value).run()} aria-pressed={current === c.value} title={t(c.name)} aria-label={t(c.name)}>
            <span className="fmt-a" style={{ color: c.value }}>A</span>
          </button>
        ))}
      </div>
      <div className="fmt-label">{t('Highlight')}</div>
      <div className="fmt-swatches">
        <button type="button" className="fmt-swatch" onMouseDown={keep} onClick={() => editor.chain().focus().unsetHighlight().run()} aria-pressed={!currentBg} title={t('None')} aria-label={t('None')}>
          <Ban size={14} />
        </button>
        {HIGHLIGHTS.map(c => (
          <button key={c.value} type="button" className="fmt-swatch" onMouseDown={keep} onClick={() => editor.chain().focus().setHighlight({ color: c.value }).run()} aria-pressed={currentBg === c.value} title={t(c.name)} aria-label={t(c.name)}>
            <span className="fmt-bg" style={{ background: c.value }} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function SizeButtons({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  const current = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? null
  return (
    <div className="fmt-row">
      {SIZES.map(s => (
        <button
          key={s.name}
          type="button"
          className="fmt-chip"
          onMouseDown={keep}
          aria-pressed={current === s.value}
          onClick={() => (s.value ? editor.chain().focus().setFontSize(s.value).run() : editor.chain().focus().unsetFontSize().run())}
        >
          {t(s.name)}
        </button>
      ))}
    </div>
  )
}

export function AlignButtons({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  const items = [
    { value: 'left', label: 'Align left', icon: <AlignLeft size={16} /> },
    { value: 'center', label: 'Align center', icon: <AlignCenter size={16} /> },
    { value: 'right', label: 'Align right', icon: <AlignRight size={16} /> },
    { value: 'justify', label: 'Justify', icon: <AlignJustify size={16} /> },
  ]
  return (
    <div className="fmt-row">
      {items.map(i => (
        <button key={i.value} type="button" className="fmt-icon" onMouseDown={keep} aria-pressed={editor.isActive({ textAlign: i.value })} onClick={() => editor.chain().focus().setTextAlign(i.value).run()} title={t(i.label)} aria-label={t(i.label)}>
          {i.icon}
        </button>
      ))}
    </div>
  )
}

export function MoreButtons({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  return (
    <div className="fmt-row">
      <button type="button" className="fmt-icon" onMouseDown={keep} aria-pressed={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title={t('Superscript')} aria-label={t('Superscript')}>
        <Superscript size={16} />
      </button>
      <button type="button" className="fmt-icon" onMouseDown={keep} aria-pressed={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title={t('Subscript')} aria-label={t('Subscript')}>
        <Subscript size={16} />
      </button>
      <button type="button" className="fmt-icon" onMouseDown={keep} onClick={() => editor.chain().focus().unsetAllMarks().run()} title={t('Clear formatting')} aria-label={t('Clear formatting')}>
        <RemoveFormatting size={16} />
      </button>
    </div>
  )
}

const BLOCKS = [
  { label: 'Text', icon: <Type size={15} />, active: (e: Editor) => e.isActive('paragraph'), run: (e: Editor) => e.chain().focus().setParagraph().run() },
  { label: 'Heading 1', icon: <Heading1 size={15} />, active: (e: Editor) => e.isActive('heading', { level: 1 }), run: (e: Editor) => e.chain().focus().setHeading({ level: 1 }).run() },
  { label: 'Heading 2', icon: <Heading2 size={15} />, active: (e: Editor) => e.isActive('heading', { level: 2 }), run: (e: Editor) => e.chain().focus().setHeading({ level: 2 }).run() },
  { label: 'Heading 3', icon: <Heading3 size={15} />, active: (e: Editor) => e.isActive('heading', { level: 3 }), run: (e: Editor) => e.chain().focus().setHeading({ level: 3 }).run() },
  { label: 'Bulleted list', icon: <List size={15} />, active: (e: Editor) => e.isActive('bulletList'), run: (e: Editor) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', icon: <ListOrdered size={15} />, active: (e: Editor) => e.isActive('orderedList'), run: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
  { label: 'To-do list', icon: <CheckSquare size={15} />, active: (e: Editor) => e.isActive('taskList'), run: (e: Editor) => e.chain().focus().toggleTaskList().run() },
  { label: 'Quote', icon: <Quote size={15} />, active: (e: Editor) => e.isActive('blockquote'), run: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
  { label: 'Code', icon: <Code2 size={15} />, active: (e: Editor) => e.isActive('codeBlock'), run: (e: Editor) => e.chain().focus().toggleCodeBlock().run() },
]

export function TurnInto({ editor, onDone }: { editor: Editor; onDone?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="fmt-list" role="menu">
      {BLOCKS.map(b => (
        <button
          key={b.label}
          type="button"
          role="menuitemradio"
          className="fmt-list-item"
          onMouseDown={keep}
          aria-checked={b.active(editor)}
          onClick={() => {
            b.run(editor)
            onDone?.()
          }}
        >
          {b.icon}
          <span>{t(b.label)}</span>
        </button>
      ))}
    </div>
  )
}

/** Name of the current block, shown on the "Turn into" button. */
export const currentBlockLabel = (editor: Editor) =>
  // Lists, quotes and code wrap paragraphs, so check them before plain "Text".
  [...BLOCKS.slice(1), BLOCKS[0]].find(b => b.active(editor))?.label ?? 'Text'

/** Small dropdown living inside the selection bar; keeps the text selected. */
export function BubbleDropdown({ label, title, children }: { label: React.ReactNode; title: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="bubble-dd" ref={root}>
      <button type="button" className={`tool bubble-dd-trigger ${open ? 'active' : ''}`} onMouseDown={keep} onClick={() => setOpen(v => !v)} title={title} aria-label={title} aria-expanded={open}>
        {label}
        <ChevronDown size={12} />
      </button>
      {open && <div className="bubble-dd-panel">{children(() => setOpen(false))}</div>}
    </div>
  )
}
