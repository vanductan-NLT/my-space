'use client'

import { useState } from 'react'
import { GoogleIcon } from '../google-icon'
import { MenuButton } from '../menu-button'
import { useI18n } from '@/lib/i18n'
import { timeAgo } from '@/lib/time'
import type { LocalDocument, LocalFolder } from '@/lib/models'

/*
 * Notion-style page list: Favorites (pinned pages), folders, then loose pages.
 * Rows are one line (icon + title); actions live in a "⋯" menu that appears on
 * hover so they never squeeze the title. Pages can be dragged onto folders.
 */

export type DocumentSidebarProps = {
  docs: LocalDocument[]
  folders: LocalFolder[]
  activeId: string
  trashCount: number
  titleOf: (title: string) => string
  textOf: (doc: LocalDocument) => string
  expandedFolders: Set<string>
  onToggleFolder: (id: string) => void
  onSelect: (id: string) => void
  onCreate: (folderId?: string) => void
  onNewFolder: () => void
  onRenameFolder: (folder: LocalFolder) => void
  onDeleteFolder: (folder: LocalFolder) => void
  onMoveToFolder: (docId: string, folderId?: string) => void
  onPickFolder: (docId: string) => void
  onTogglePin: (doc: LocalDocument) => void
  onDuplicate: (doc: LocalDocument) => void
  onTrash: (doc: LocalDocument) => void
  onOpenTrash: () => void
  onQuickFind: () => void
  onImport: () => void
  onBackup: () => void
}

export function DocumentSidebar(props: DocumentSidebarProps) {
  const { docs, folders, activeId, titleOf, textOf, expandedFolders } = props
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const filtered = needle ? docs.filter(d => titleOf(d.title).toLowerCase().includes(needle) || textOf(d).toLowerCase().includes(needle)) : docs
  const pinned = docs.filter(d => d.isPinned)
  const loose = docs.filter(d => !d.folderId || !folders.some(f => f.id === d.folderId))
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

  const dropProps = (key: string, folderId?: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('application/x-my-space-doc')) return
      e.preventDefault()
      if (dragOver !== key) setDragOver(key)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null)
    },
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData('application/x-my-space-doc')
      setDragOver(null)
      if (!id) return
      e.preventDefault()
      props.onMoveToFolder(id, folderId)
    },
  })

  const row = (d: LocalDocument, nested = false) => {
    const active = d.id === activeId
    return (
      <div
        key={d.id}
        className={`document-row ${active ? 'active' : ''} ${nested ? 'nested' : ''} ${menuFor === d.id ? 'menu-open' : ''}`}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/x-my-space-doc', d.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
      >
        <button
          type="button"
          className="doc-select-btn"
          onClick={() => props.onSelect(d.id)}
          aria-current={active ? 'true' : undefined}
          title={`${titleOf(d.title)} · ${timeAgo(d.updatedAt)}`}
        >
          <span className="doc-icon">{d.icon ?? <GoogleIcon name="description" size={17} />}</span>
          <span className="doc-title">{titleOf(d.title)}</span>
        </button>
        <div className="doc-actions">
          <MenuButton
            variant="icon"
            triggerClassName="doc-action-btn"
            label={t('More actions')}
            icon={<GoogleIcon name="more_horiz" size={17} />}
            onOpenChange={open => setMenuFor(open ? d.id : null)}
            items={[
              { label: d.isPinned ? t('Remove from Favorites') : t('Add to Favorites'), icon: <GoogleIcon name="star" size={16} fill={d.isPinned} />, onSelect: () => props.onTogglePin(d) },
              { label: t('Duplicate'), icon: <GoogleIcon name="content_copy" size={16} />, onSelect: () => props.onDuplicate(d) },
              { label: t('Move to folder'), icon: <GoogleIcon name="drive_file_move" size={16} />, onSelect: () => props.onPickFolder(d.id) },
              'separator',
              { label: t('Move to Trash'), icon: <GoogleIcon name="delete" size={16} />, danger: true, onSelect: () => props.onTrash(d) },
            ]}
          />
        </div>
      </div>
    )
  }

  return (
    <aside className="documents" aria-label={t('Documents')}>
      <div className="docs-head">
        <h1>{t('Documents')}</h1>
        <div className="docs-head-actions">
          <button type="button" className="doc-action-btn" onClick={props.onNewFolder} aria-label={t('New folder')} title={t('New folder')}>
            <GoogleIcon name="create_new_folder" size={18} />
          </button>
          <button type="button" className="doc-action-btn" onClick={() => props.onCreate()} aria-label={t('New page')} title={t('New page')}>
            <GoogleIcon name="edit_square" size={18} />
          </button>
        </div>
      </div>

      <div className="docs-nav">
        <button type="button" className="docs-nav-item" onClick={props.onQuickFind}>
          <GoogleIcon name="search" size={17} />
          <span className="docs-nav-label">{t('Search')}</span>
          <kbd>{modKey}P</kbd>
        </button>
      </div>

      <label className="search">
        <GoogleIcon name="filter_list" size={16} className="search-icon" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Filter pages…')} aria-label={t('Search documents')} />
        {query && (
          <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label={t('Clear')}>
            <GoogleIcon name="close" size={14} />
          </button>
        )}
      </label>

      <div className="document-list">
        {needle ? (
          <>
            {!filtered.length && <p className="list-empty">{t('Nothing matches “{query}”.', { query: query.trim() })}</p>}
            {filtered.map(d => row(d))}
          </>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="sidebar-section">
                <div className="folders-section-header">{t('Favorites')}</div>
                {pinned.map(d => row(d))}
              </section>
            )}

            {folders.length > 0 && (
              <section className="sidebar-section">
                <div className="folders-section-header">{t('Folders')}</div>
                {folders.map(f => {
                  const open = expandedFolders.has(f.id)
                  const inside = docs.filter(d => d.folderId === f.id)
                  return (
                    <div key={f.id} className={`folder-group ${dragOver === f.id ? 'drag-over' : ''}`} {...dropProps(f.id, f.id)}>
                      <div className={`folder-row ${menuFor === f.id ? 'menu-open' : ''}`}>
                        <button
                          type="button"
                          className="folder-toggle"
                          onClick={() => props.onToggleFolder(f.id)}
                          onDoubleClick={() => props.onRenameFolder(f)}
                          aria-expanded={open}
                          title={t('Click to expand, double-click to rename')}
                        >
                          <GoogleIcon name="chevron_right" size={16} className={`folder-chevron ${open ? 'open' : ''}`} />
                          <GoogleIcon name={open ? 'folder_open' : 'folder'} size={17} className="folder-icon" />
                          <span className="folder-title">{f.title}</span>
                          <span className="folder-count">{inside.length}</span>
                        </button>
                        <div className="doc-actions">
                          <button type="button" className="doc-action-btn" title={t('New document in folder')} aria-label={t('New document in folder')} onClick={() => props.onCreate(f.id)}>
                            <GoogleIcon name="add" size={17} />
                          </button>
                          <MenuButton
                            variant="icon"
                            triggerClassName="doc-action-btn"
                            label={t('Folder actions')}
                            icon={<GoogleIcon name="more_horiz" size={17} />}
                            onOpenChange={o => setMenuFor(o ? f.id : null)}
                            items={[
                              { label: t('Rename folder'), icon: <GoogleIcon name="edit" size={16} />, onSelect: () => props.onRenameFolder(f) },
                              'separator',
                              { label: t('Delete folder'), icon: <GoogleIcon name="delete" size={16} />, danger: true, onSelect: () => props.onDeleteFolder(f) },
                            ]}
                          />
                        </div>
                      </div>
                      {open && (
                        <div className="folder-contents">
                          {inside.map(d => row(d, true))}
                          {!inside.length && (
                            <button type="button" className="folder-add-quick-btn" onClick={() => props.onCreate(f.id)}>
                              <GoogleIcon name="add" size={14} /> {t('Empty folder — add a page')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>
            )}

            <section className={`sidebar-section uncategorized-zone ${dragOver === 'loose' ? 'drag-over' : ''}`} {...dropProps('loose')}>
              {(folders.length > 0 || pinned.length > 0) && <div className="folders-section-header">{t('Pages')}</div>}
              {loose.map(d => row(d))}
              {!loose.length && folders.length > 0 && <div className="uncategorized-empty-drop">{t('Drop here to remove from folder')}</div>}
              <button type="button" className="docs-add-page" onClick={() => props.onCreate()}>
                <GoogleIcon name="add" size={16} /> {t('New page')}
              </button>
            </section>
          </>
        )}
      </div>

      <div className="docs-footer">
        <button type="button" className="docs-nav-item" onClick={props.onOpenTrash}>
          <GoogleIcon name="delete" size={17} />
          <span className="docs-nav-label">{t('Trash')}</span>
          {props.trashCount > 0 && <span className="docs-count">{props.trashCount}</span>}
        </button>
        <div className="docs-footer-row">
          <button type="button" className="button" onClick={props.onImport}>
            <GoogleIcon name="upload_file" size={16} /> {t('Import')}
          </button>
          <button type="button" className="button" onClick={props.onBackup}>
            <GoogleIcon name="cloud_download" size={16} /> {t('Backup')}
          </button>
        </div>
        <p>{t('Stored only in this browser. Back up now and then.')}</p>
      </div>
    </aside>
  )
}
