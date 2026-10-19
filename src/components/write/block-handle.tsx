'use client'

import type { Editor } from '@tiptap/react'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GoogleIcon } from '../google-icon'
import { TurnInto } from './format-controls'
import { moveTopLevelBlock } from './block-editing-behaviors'
import { useI18n } from '@/lib/i18n'

/*
 * Notion-style block handle shown in the left gutter of the hovered block:
 * "+" adds a block below (and opens the "/" menu), "⋮⋮" drags the block to a
 * new place or, when clicked, opens a menu (turn into, duplicate, move, delete).
 * List items get their own handle so single items can be reordered.
 */

type Target = {
  /** Position before the block the handle acts on (a top-level block or a list item). */
  pos: number
  /** Position before the top-level block that contains it. */
  topPos: number
  topIndex: number
  isTopLevel: boolean
  dom: HTMLElement
  /** Handle offset inside the page, aligned with the block's first line. */
  top: number
  left: number
}

const LIST_ITEMS = ['listItem', 'taskItem']
const HANDLE_HEIGHT = 24

export function BlockHandle({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  const [target, setTarget] = useState<Target | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuOpenRef = useRef(false)
  menuOpenRef.current = menuOpen

  useEffect(() => {
    const view = editor.view
    const page = view.dom.closest<HTMLElement>('.page')
    const area = view.dom.closest<HTMLElement>('.editor-scroll')
    if (!page || !area) return

    const locate = (clientY: number): Target | null => {
      const blocks = [...view.dom.children] as HTMLElement[]
      if (!blocks.length) return null
      const first = blocks[0].getBoundingClientRect()
      const last = blocks[blocks.length - 1].getBoundingClientRect()
      if (clientY < first.top - 12 || clientY > last.bottom + 12) return null

      // Nearest top-level block by vertical distance (margins between blocks count too).
      let el = blocks[0]
      let best = Infinity
      for (const b of blocks) {
        const r = b.getBoundingClientRect()
        const d = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0
        if (d < best) {
          best = d
          el = b
        }
      }

      let topPos: number
      try {
        const inner = view.posAtDOM(el, 0)
        const $inner = view.state.doc.resolve(inner)
        topPos = $inner.depth ? $inner.before(1) : inner
      } catch {
        return null
      }
      const topIndex = view.state.doc.resolve(topPos).index(0)
      let pos = topPos
      let dom = el

      // Inside a list, act on the hovered item rather than the whole list.
      if (el.matches('ul, ol')) {
        const item = [...el.children].find(li => {
          const r = li.getBoundingClientRect()
          return clientY >= r.top && clientY <= r.bottom
        }) as HTMLElement | undefined
        if (item) {
          try {
            const $p = view.state.doc.resolve(view.posAtDOM(item, 0))
            for (let d = $p.depth; d > 0; d--) {
              if (LIST_ITEMS.includes($p.node(d).type.name)) {
                pos = $p.before(d)
                dom = item
                break
              }
            }
          } catch {
            // Fall back to the whole list.
          }
        }
      }

      const pageRect = page.getBoundingClientRect()
      const r = dom.getBoundingClientRect()
      const firstLine = dom.matches('ul, ol, li') ? (dom.querySelector('p') ?? dom) : dom.matches('p, h1, h2, h3') ? dom : null
      const lineHeight = firstLine ? parseFloat(getComputedStyle(firstLine).lineHeight) : NaN
      const lineTop = firstLine ? firstLine.getBoundingClientRect().top : r.top
      const top = (Number.isFinite(lineHeight) ? lineTop + (lineHeight - HANDLE_HEIGHT) / 2 : r.top + 4) - pageRect.top
      // List markers sit in the list's padding, so list items align the handle with the list's edge.
      const edge = dom.matches('li') && dom.parentElement ? dom.parentElement.getBoundingClientRect().left : r.left
      const left = edge - pageRect.left
      return { pos, topPos, topIndex, isTopLevel: pos === topPos, dom, top, left }
    }

    const onMove = (e: MouseEvent) => {
      if (menuOpenRef.current || handleRef.current?.contains(e.target as Node)) return
      if (e.buttons) return // a selection or drag is in progress
      setTarget(locate(e.clientY))
    }
    const hide = () => !menuOpenRef.current && setTarget(null)

    area.addEventListener('mousemove', onMove)
    area.addEventListener('mouseleave', hide)
    view.dom.addEventListener('keydown', hide)
    return () => {
      area.removeEventListener('mousemove', onMove)
      area.removeEventListener('mouseleave', hide)
      view.dom.removeEventListener('keydown', hide)
    }
  }, [editor])

  // The menu is fixed to the viewport: below the handle, or lifted so it never runs off-screen.
  useLayoutEffect(() => {
    if (!menuOpen || !handleRef.current || !menuRef.current) {
      setMenuPos(null)
      return
    }
    const h = handleRef.current.getBoundingClientRect()
    const m = menuRef.current.getBoundingClientRect()
    const top = Math.max(8, Math.min(h.bottom + 6, window.innerHeight - m.height - 8))
    const left = Math.max(8, Math.min(h.left, window.innerWidth - m.width - 8))
    setMenuPos({ top, left })
  }, [menuOpen])

  // Close the block menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !handleRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setMenuOpen(false)
        editor.commands.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen, editor])

  if (!target) return null

  const nodeAt = (pos: number) => editor.state.doc.nodeAt(pos)

  const addBelow = () => {
    const node = nodeAt(target.topPos)
    if (!node) return
    const at = target.topPos + node.nodeSize
    const { state, view } = editor
    const tr = state.tr.insert(at, state.schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, at + 1))
    view.dispatch(tr)
    view.focus()
    // Typing "/" opens the block menu right where the new line is.
    editor.commands.insertContent('/')
  }

  const onDragStart = (e: React.DragEvent) => {
    const { state, view } = editor
    const selection = NodeSelection.create(state.doc, target.pos)
    view.dispatch(state.tr.setSelection(selection))
    const slice = selection.content()
    // ProseMirror's own drop handler moves the dragged slice when `dragging.move` is set.
    ;(view as unknown as { dragging: unknown }).dragging = { slice, move: true }
    e.dataTransfer.clearData()
    e.dataTransfer.setData('text/plain', slice.content.textBetween(0, slice.content.size, '\n\n'))
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setDragImage(target.dom, 0, 0)
    setMenuOpen(false)
  }

  const run = (action: () => void) => {
    action()
    setMenuOpen(false)
    setTarget(null)
  }

  const node = nodeAt(target.pos)
  const canTurnInto = !!node && (node.isTextblock || node.firstChild?.isTextblock)

  const selectInside = () => {
    const { state, view } = editor
    view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(target.pos + 1))))
  }

  return (
    <>
      <div ref={handleRef} className="block-handle" style={{ top: target.top, left: target.left }} contentEditable={false}>
        <button type="button" className="block-handle-btn" onClick={addBelow} title={t('Add a block below')} aria-label={t('Add a block below')}>
          <GoogleIcon name="add" size={18} />
        </button>
        <button
          type="button"
          className="block-handle-btn grip"
          draggable
          onDragStart={onDragStart}
          onDragEnd={() => setTarget(null)}
          onClick={() => setMenuOpen(v => !v)}
          title={t('Drag to move · Click for options')}
          aria-label={t('Block options')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <GoogleIcon name="drag_indicator" size={18} />
        </button>
      </div>

      {menuOpen && node && createPortal(
        <div ref={menuRef} className="block-menu" role="menu" style={{ top: menuPos?.top ?? -9999, left: menuPos?.left ?? -9999 }} onMouseDown={e => e.preventDefault()}>
          {canTurnInto && (
            <>
              <div className="fmt-label">{t('Turn into')}</div>
              <div onMouseDownCapture={selectInside}>
                <TurnInto editor={editor} onDone={() => run(() => undefined)} />
              </div>
              <div className="menu-separator" />
            </>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={() => run(() => {
            const n = nodeAt(target.pos)
            if (n) editor.view.dispatch(editor.state.tr.insert(target.pos + n.nodeSize, n.copy(n.content)))
          })}>
            <GoogleIcon name="content_copy" size={16} /> <span>{t('Duplicate')}</span>
          </button>
          {target.isTopLevel && (
            <>
              <button type="button" role="menuitem" className="menu-item" disabled={target.topIndex === 0} onClick={() => run(() => {
                const tr = moveTopLevelBlock(editor.state, target.topIndex, -1)
                if (tr) editor.view.dispatch(tr)
              })}>
                <GoogleIcon name="arrow_upward" size={16} /> <span>{t('Move up')}</span> <small>Alt⇧↑</small>
              </button>
              <button type="button" role="menuitem" className="menu-item" disabled={target.topIndex >= editor.state.doc.childCount - 1} onClick={() => run(() => {
                const tr = moveTopLevelBlock(editor.state, target.topIndex, 1)
                if (tr) editor.view.dispatch(tr)
              })}>
                <GoogleIcon name="arrow_downward" size={16} /> <span>{t('Move down')}</span> <small>Alt⇧↓</small>
              </button>
            </>
          )}
          <div className="menu-separator" />
          <button type="button" role="menuitem" className="menu-item danger" onClick={() => run(() => {
            // The last item of a list takes the (now empty) list with it.
            const top = nodeAt(target.topPos)
            const onlyItem = !target.isTopLevel && top?.childCount === 1
            const from = onlyItem ? target.topPos : target.pos
            const n = nodeAt(from)
            if (n) editor.view.dispatch(editor.state.tr.delete(from, from + n.nodeSize))
          })}>
            <GoogleIcon name="delete" size={16} /> <span>{t('Delete')}</span>
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
