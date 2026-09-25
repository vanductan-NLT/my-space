'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

const FOCUSABLE = 'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'

/**
 * Small accessible dialog: Escape and a click outside close it, focus moves in
 * (to [data-autofocus] or the first control) and returns to where it was, and
 * Tab stays inside while it is open.
 */
export function Modal({
  title,
  onClose,
  children,
  sheet = false,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** On phones, slide up from the bottom like a native sheet. */
  sheet?: boolean
}) {
  const titleId = useId()
  const { t } = useI18n()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = dialog.current
    const first = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    if (first instanceof HTMLInputElement) first.select()
    return () => previous?.focus?.()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Handled here so page-level Escape handlers (e.g. focus mode) don't also fire.
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !dialog.current) return
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!items.length) return
    const [first, last] = [items[0], items[items.length - 1]]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Portalled to <body>: parents with backdrop-filter (the bottom bar, the
  // workspace) would otherwise trap the fixed overlay inside themselves.
  return createPortal(
    <div className={`modal-overlay ${sheet ? 'sheet' : ''}`} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('Close')}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
