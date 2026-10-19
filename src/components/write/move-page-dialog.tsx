'use client'

import { useState } from 'react'
import { GoogleIcon } from '../google-icon'
import { Modal } from '../modal'
import { useI18n } from '@/lib/i18n'
import { canNest, type PageTree } from '@/lib/page-tree'
import type { LocalFolder } from '@/lib/models'

/**
 * "Move to": file a page in a folder, make it top-level, or put it inside
 * another page. The page itself and its own sub-pages are never offered as a
 * destination. This is also the touch-friendly way to nest pages (no drag).
 */
export function MovePageDialog({
  docId,
  tree,
  folders,
  titleOf,
  onMoveToFolder,
  onNest,
  onClose,
}: {
  docId: string
  tree: PageTree
  folders: LocalFolder[]
  titleOf: (title: string) => string
  onMoveToFolder: (folderId?: string) => void
  onNest: (parentId: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const match = (title: string) => !needle || title.toLowerCase().includes(needle)
  const shownFolders = folders.filter(f => match(f.title))
  const pages = [...tree.byId.values()].filter(d => canNest(tree, docId, d.id) && match(titleOf(d.title)))
  const currentParent = tree.parent.get(docId)
  const pick = (run: () => void) => {
    run()
    onClose()
  }

  return (
    <Modal title={t('Move to')} onClose={onClose}>
      <label className="search move-search">
        <GoogleIcon name="search" size={17} className="search-icon" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Filter folders and pages…')} aria-label={t('Filter folders and pages…')} data-autofocus />
      </label>
      <div className="move-modal-list">
        {match(t('Pages (no folder)')) && (
          <button type="button" className="button move-item" onClick={() => pick(() => onMoveToFolder())}>
            <GoogleIcon name="description" size={18} /> {t('Pages (no folder)')}
          </button>
        )}
        {shownFolders.map(f => (
          <button key={f.id} type="button" className="button move-item" onClick={() => pick(() => onMoveToFolder(f.id))}>
            <GoogleIcon name="folder" size={18} /> {f.title}
          </button>
        ))}
        {pages.length > 0 && <div className="move-section">{t('Inside a page')}</div>}
        {pages.map(d => (
          <button key={d.id} type="button" className={`button move-item ${d.id === currentParent ? 'current' : ''}`} onClick={() => pick(() => onNest(d.id))} disabled={d.id === currentParent}>
            <span className="move-item-icon">{d.icon ?? <GoogleIcon name="description" size={18} />}</span>
            <span className="move-item-title">{titleOf(d.title)}</span>
          </button>
        ))}
        {!pages.length && !shownFolders.length && needle && <p className="list-empty">{t('Nothing matches “{query}”.', { query: query.trim() })}</p>}
      </div>
    </Modal>
  )
}
