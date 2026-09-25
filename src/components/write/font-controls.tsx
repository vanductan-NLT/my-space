'use client'

import type { Editor } from '@tiptap/react'
import { Check, Type } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { FONTS } from './fonts'

const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault()

/** Font for the whole page (like Notion's page font), remembered per document. */
export function PageFontButton({ font, onChange }: { font: string; onChange: (id: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="menu-root" ref={root}>
      <button type="button" className="icon-button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="true" title={t('Page font')} aria-label={t('Page font')}>
        <Type size={18} />
      </button>
      {open && (
        <div className="menu-popover font-popover" role="group" aria-label={t('Page font')}>
          <div className="font-popover-title">{t('Page font')}</div>
          <div className="font-cards">
            {FONTS.map(f => (
              <button
                key={f.id}
                type="button"
                className="font-card"
                aria-pressed={font === f.id}
                onClick={() => {
                  onChange(f.id)
                  setOpen(false)
                }}
              >
                <span className="font-ag" style={{ fontFamily: f.family ?? undefined }}>
                  Ag
                </span>
                <span className="font-name">{f.id === 'default' ? t('Default') : f.name}</span>
                <small>{t(f.kind)}</small>
                {font === f.id && <Check size={14} className="font-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Font for the selected words (textStyle fontFamily). */
export function InlineFontChips({ editor }: { editor: Editor }) {
  const { t } = useI18n()
  const current = editor.getAttributes('textStyle').fontFamily as string | undefined
  return (
    <div className="fmt-row fmt-fonts">
      {FONTS.map(f => (
        <button
          key={f.id}
          type="button"
          className="fmt-chip"
          onMouseDown={keep}
          style={{ fontFamily: f.family ?? undefined }}
          aria-pressed={f.family ? current === f.family : !current}
          onClick={() => (f.family ? editor.chain().focus().setFontFamily(f.family).run() : editor.chain().focus().unsetFontFamily().run())}
        >
          {f.id === 'default' ? t('Default') : f.name}
        </button>
      ))}
    </div>
  )
}
