'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GoogleIcon } from '../google-icon'
import { useI18n } from '@/lib/i18n'
import { timeAgo } from '@/lib/time'
import type { LocalDocument, LocalFolder } from '@/lib/models'

type Entry = { kind: 'doc'; doc: LocalDocument } | { kind: 'create'; title: string }

/**
 * Notion-style Quick Find (Ctrl/⌘+P): type to search titles and text, ↑/↓ to
 * move, Enter to open. With no query it lists recently edited pages; when
 * nothing matches, Enter creates a page with the typed title.
 */
export function QuickFindPalette({
  docs,
  folders,
  titleOf,
  textOf,
  onOpen,
  onCreate,
  onClose,
}: {
  docs: LocalDocument[]
  folders: LocalFolder[]
  titleOf: (title: string) => string
  textOf: (doc: LocalDocument) => string
  onOpen: (id: string) => void
  onCreate: (title: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const needle = query.trim().toLowerCase()
  const entries: Entry[] = useMemo(() => {
    const byRecent = [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    if (!needle) return byRecent.slice(0, 8).map(doc => ({ kind: 'doc' as const, doc }))
    const titleHits = byRecent.filter(d => titleOf(d.title).toLowerCase().includes(needle))
    const textHits = byRecent.filter(d => !titleHits.includes(d) && textOf(d).toLowerCase().includes(needle))
    const found: Entry[] = [...titleHits, ...textHits].slice(0, 20).map(doc => ({ kind: 'doc' as const, doc }))
    return [...found, { kind: 'create' as const, title: query.trim() }]
  }, [docs, needle, query, titleOf, textOf])

  useEffect(() => {
    input.current?.focus()
  }, [])

  useEffect(() => setIndex(0), [needle])

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const choose = (entry: Entry | undefined) => {
    if (!entry) return
    if (entry.kind === 'doc') onOpen(entry.doc.id)
    else onCreate(entry.title)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!entries.length) return
      setIndex(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length)
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      choose(entries[Math.min(index, entries.length - 1)])
    }
  }

  const folderName = (id?: string) => (id ? folders.find(f => f.id === id)?.title : undefined)

  return createPortal(
    <div className="modal-overlay quick-find-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="quick-find" role="dialog" aria-modal="true" aria-label={t('Quick find')} onKeyDown={onKeyDown}>
        <label className="quick-find-search">
          <GoogleIcon name="search" size={20} />
          <input
            ref={input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('Search or jump to a page…')}
            aria-label={t('Search pages')}
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-find-list"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="quick-find-list" id="quick-find-list" role="listbox" ref={list}>
          {!needle && <div className="quick-find-section">{t('Recent')}</div>}
          {entries.map((entry, i) => {
            const selected = i === Math.min(index, entries.length - 1)
            if (entry.kind === 'create') {
              return (
                <button key="create" type="button" role="option" aria-selected={selected} className="quick-find-item" onMouseEnter={() => setIndex(i)} onClick={() => choose(entry)}>
                  <span className="quick-find-icon"><GoogleIcon name="add" size={18} /></span>
                  <span className="quick-find-title">{t('New page “{title}”', { title: entry.title })}</span>
                </button>
              )
            }
            const { doc } = entry
            const folder = folderName(doc.folderId)
            return (
              <button key={doc.id} type="button" role="option" aria-selected={selected} className="quick-find-item" onMouseEnter={() => setIndex(i)} onClick={() => choose(entry)}>
                <span className="quick-find-icon">{doc.icon ?? <GoogleIcon name="description" size={18} />}</span>
                <span className="quick-find-title">{titleOf(doc.title)}</span>
                <span className="quick-find-meta">
                  {folder && <>{folder} · </>}
                  {timeAgo(doc.updatedAt)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="quick-find-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('to move')}</span>
          <span><kbd>↵</kbd> {t('to open')}</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
