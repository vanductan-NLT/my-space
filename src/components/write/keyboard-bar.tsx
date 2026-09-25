'use client'

import type { Editor } from '@tiptap/react'
import {
  Bold, CheckSquare, ChevronDown, Heading1, Heading2, Image as ImageIcon, Italic, Link2, List, ListOrdered, Redo2,
  Strikethrough, Underline, Undo2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { AlignButtons, ColorPanel, MoreButtons, SizeButtons } from './format-controls'
import { InlineFontChips } from './font-controls'

/*
 * Phones: formatting sits right on top of the on-screen keyboard (like Notion
 * mobile) instead of at the top of the page, so bold/italic/lists are one tap
 * away while typing. Follows the visual viewport, so it rides the keyboard.
 */

const isTouch = () => window.matchMedia('(pointer: coarse)').matches

export function KeyboardBar({ editor, onOpenLink, onPickImage }: { editor: Editor; onOpenLink: () => void; onPickImage: () => void }) {
  const [focused, setFocused] = useState(false)
  const [bottom, setBottom] = useState(0)
  const [, rerender] = useState(0)
  const [more, setMore] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    if (!isTouch()) return
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    const onChange = () => rerender(n => n + 1) // refresh active states
    editor.on('focus', onFocus)
    editor.on('blur', onBlur)
    editor.on('selectionUpdate', onChange)
    editor.on('transaction', onChange)
    setFocused(editor.isFocused)
    return () => {
      editor.off('focus', onFocus)
      editor.off('blur', onBlur)
      editor.off('selectionUpdate', onChange)
      editor.off('transaction', onChange)
    }
  }, [editor])

  // Distance from the layout viewport's bottom to the top of the keyboard.
  useEffect(() => {
    const vv = window.visualViewport
    if (!focused || !vv) return
    const place = () => setBottom(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)))
    place()
    vv.addEventListener('resize', place)
    vv.addEventListener('scroll', place)
    return () => {
      vv.removeEventListener('resize', place)
      vv.removeEventListener('scroll', place)
    }
  }, [focused])

  if (!focused) return null

  const extra = more && (
    <div className="kb-extra" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}>
      <ColorPanel editor={editor} />
      <div className="kb-extra-row kb-fonts">
        <InlineFontChips editor={editor} />
      </div>
      <div className="kb-extra-row">
        <SizeButtons editor={editor} />
      </div>
      <div className="kb-extra-row">
        <AlignButtons editor={editor} />
        <MoreButtons editor={editor} />
      </div>
    </div>
  )

  // Blocking the default of pointer/mouse down stops the button from taking
  // focus, so the caret and the keyboard stay put; the action runs on click,
  // so swiping the bar sideways doesn't trigger buttons.
  const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault()

  const tool = (label: string, icon: React.ReactNode, fn: () => void, active = false) => (
    <button
      key={label}
      type="button"
      className={`kb-tool ${active ? 'active' : ''}`}
      aria-label={t(label)}
      aria-pressed={active}
      onPointerDown={keepFocus}
      onMouseDown={keepFocus}
      onClick={fn}
    >
      {icon}
    </button>
  )

  const c = () => editor.chain().focus()

  return createPortal(
    <div className="keyboard-bar" style={{ bottom }} role="toolbar" aria-label={t('Formatting')}>
      {extra}
      <div className="kb-scroll">
        <button
          type="button"
          className={`kb-tool kb-aa ${more ? 'active' : ''}`}
          aria-label={t('Colour, size and alignment')}
          aria-expanded={more}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={() => setMore(v => !v)}
        >
          Aa
        </button>
        <button type="button" className="kb-tool kb-slash" aria-label={t('Insert block')} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => c().insertContent('/').run()}>
          /
        </button>
        {tool('Bold', <Bold size={18} />, () => c().toggleBold().run(), editor.isActive('bold'))}
        {tool('Italic', <Italic size={18} />, () => c().toggleItalic().run(), editor.isActive('italic'))}
        {tool('Underline', <Underline size={18} />, () => c().toggleUnderline().run(), editor.isActive('underline'))}
        {tool('Strikethrough', <Strikethrough size={18} />, () => c().toggleStrike().run(), editor.isActive('strike'))}
        <span className="kb-sep" />
        {tool('Heading 1', <Heading1 size={18} />, () => c().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
        {tool('Heading 2', <Heading2 size={18} />, () => c().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {tool('Bulleted list', <List size={18} />, () => c().toggleBulletList().run(), editor.isActive('bulletList'))}
        {tool('Numbered list', <ListOrdered size={18} />, () => c().toggleOrderedList().run(), editor.isActive('orderedList'))}
        {tool('To-do list', <CheckSquare size={18} />, () => c().toggleTaskList().run(), editor.isActive('taskList'))}
        <span className="kb-sep" />
        {tool('Image', <ImageIcon size={18} />, onPickImage)}
        {tool('Link', <Link2 size={18} />, onOpenLink, editor.isActive('link'))}
        {tool('Undo', <Undo2 size={18} />, () => c().undo().run())}
        {tool('Redo', <Redo2 size={18} />, () => c().redo().run())}
      </div>
      {tool('Done', <ChevronDown size={20} />, () => editor.commands.blur())}
    </div>,
    document.body
  )
}
