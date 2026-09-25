'use client'

import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

export type MenuItem =
  | { label: string; hint?: string; icon?: React.ReactNode; onSelect: () => void }
  | 'separator'

/**
 * Button that opens a small menu. Arrow keys move between items, Enter picks,
 * Escape or a click outside closes, and focus returns to the button.
 */
export function MenuButton({ label, icon, items }: { label: string; icon?: React.ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  const entries = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])]

  useEffect(() => {
    if (!open) return
    entries()[0]?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
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

  return (
    <div className="menu-root" ref={root}>
      <button
        ref={button}
        type="button"
        className="button menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {icon}
        <span className="menu-trigger-label">{label}</span>
        <ChevronDown size={14} className="menu-chevron" />
      </button>
      {open && (
        <div className="menu-popover" role="menu" id={menuId} aria-label={label} onKeyDown={onKeyDown}>
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={`sep-${i}`} className="menu-separator" role="separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  close()
                  item.onSelect()
                }}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.hint && <small>{item.hint}</small>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
