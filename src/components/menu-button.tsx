'use client'

import { GoogleIcon } from './google-icon'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem =
  | { label: string; hint?: string; icon?: React.ReactNode; onSelect: () => void; checked?: boolean; danger?: boolean }
  | 'separator'

/**
 * Button that opens a small menu. Arrow keys move between items, Enter picks,
 * Escape or a click outside closes, and focus returns to the button.
 *
 * `variant="icon"` renders an icon-only trigger (a row's "more" button) whose
 * menu is portalled to <body> with fixed positioning, so clipped or scrolling
 * parents such as the sidebar list can't cut it off.
 */
export function MenuButton({
  label,
  icon,
  items,
  variant = 'button',
  triggerClassName,
  onOpenChange,
}: {
  label: string
  icon?: React.ReactNode
  items: MenuItem[]
  variant?: 'button' | 'icon'
  triggerClassName?: string
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const portalled = variant === 'icon'

  // Tell the parent after the change is committed (never from inside a state updater).
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onOpenChangeRef.current?.(open)
  }, [open])

  const entries = () => [...(popover.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])]

  // Fixed menus open below the trigger, right-aligned, and flip up near the bottom edge.
  useLayoutEffect(() => {
    if (!open || !portalled || !button.current || !popover.current) return
    const r = button.current.getBoundingClientRect()
    const box = popover.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.right - box.width, window.innerWidth - box.width - 8))
    const below = r.bottom + 6
    const top = below + box.height > window.innerHeight - 8 ? Math.max(8, r.top - box.height - 6) : below
    setPosition({ top, left })
  }, [open, portalled])

  useEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    entries()[0]?.focus({ preventScroll: true })
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = entries()
    const index = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      list[(index + step + list.length) % list.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const menu = open && (
    <div
      ref={popover}
      className={`menu-popover ${portalled ? 'fixed' : ''}`}
      role="menu"
      id={menuId}
      aria-label={label}
      onKeyDown={onKeyDown}
      style={portalled ? { top: position?.top ?? -9999, left: position?.left ?? -9999 } : undefined}
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={`sep-${i}`} className="menu-separator" role="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`menu-item ${item.danger ? 'danger' : ''}`}
            onClick={e => {
              e.stopPropagation()
              close()
              item.onSelect()
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.hint && <small>{item.hint}</small>}
            {item.checked !== undefined && <span className={`menu-switch ${item.checked ? 'on' : ''}`} aria-hidden="true" />}
          </button>
        )
      )}
    </div>
  )

  return (
    <div className="menu-root" ref={root}>
      <button
        ref={button}
        type="button"
        className={portalled ? triggerClassName ?? 'icon-button' : 'button menu-trigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={portalled ? label : undefined}
        title={portalled ? label : undefined}
        onClick={e => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {icon}
        {!portalled && (
          <>
            <span className="menu-trigger-label">{label}</span>
            <GoogleIcon name="arrow_drop_down" size={16} className="menu-chevron" />
          </>
        )}
      </button>
      {portalled ? menu && createPortal(menu, document.body) : menu}
    </div>
  )
}
