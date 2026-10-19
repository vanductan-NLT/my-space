'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'

/** A curated, quick-to-scan emoji set for page icons (no picker library needed). */
export const PAGE_ICONS = [
  '📄', '📝', '📒', '📓', '📔', '📚', '📖', '🔖', '📌', '📎',
  '💡', '🧠', '🎯', '🚀', '⭐', '✨', '🔥', '⚡', '🌱', '🌿',
  '✅', '📅', '⏰', '📊', '📈', '🗂️', '🗒️', '🧾', '💼', '🏷️',
  '🎓', '🔬', '🧪', '💻', '🛠️', '⚙️', '🧩', '🎨', '🎵', '📷',
  '🏠', '✈️', '🍀', '☕', '🍎', '💪', '🧘', '❤️', '😊', '🙌',
  '🐱', '🐶', '🌙', '☀️', '🌈', '🌊', '🏔️', '🎉', '💬', '🔒',
]

export const randomPageIcon = () => PAGE_ICONS[Math.floor(Math.random() * PAGE_ICONS.length)]

/**
 * Small popover grid for picking a page emoji. Escape or a click outside
 * closes it; "Remove" clears the icon.
 */
export function PageIconPicker({
  current,
  onPick,
  onClose,
}: {
  current?: string
  onPick: (icon: string | undefined) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], .icon-cell')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return (
    <div ref={root} className="icon-picker" role="dialog" aria-label={t('Choose an icon')}>
      <div className="icon-picker-head">
        <span>{t('Choose an icon')}</span>
        <div>
          <button type="button" className="icon-picker-link" onClick={() => onPick(randomPageIcon())}>
            {t('Random')}
          </button>
          {current && (
            <button type="button" className="icon-picker-link" onClick={() => onPick(undefined)}>
              {t('Remove')}
            </button>
          )}
        </div>
      </div>
      <div className="icon-grid">
        {PAGE_ICONS.map(icon => (
          <button key={icon} type="button" className="icon-cell" aria-pressed={icon === current} onClick={() => onPick(icon)}>
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}
