'use client'

import { useState } from 'react'
import { GoogleIcon } from '../google-icon'
import { MenuButton } from '../menu-button'
import { useI18n } from '@/lib/i18n'
import type { PageTree } from '@/lib/page-tree'
import type { LocalDocument, LocalFolder } from '@/lib/models'
import { DOC_DRAG_TYPE, SidebarPageRow, type PageRowShared } from './sidebar-page-row'

/*
 * Notion-style page list: Favorites (pinned pages), folders, then loose pages.
 * Rows are one line (icon + title); actions appear on hover so they never
 * squeeze the title. Pages nest: each top-level page opens into its sub-pages.
 * Drag a page onto a folder to file it, onto another page to nest it, or onto
 * the Pages zone to make it a top-level page again.
 */

export type DocumentSidebarProps = {
  docs: LocalDocument[]
  tree: PageTree
  folders: LocalFolder[]
  activeId: string
  trashCount: number
  titleOf: (title: string) => string
  textOf: (doc: LocalDocument) => string
  expandedFolders: Set<string>
  onToggleFolder: (id: string) => void
  expandedPages: Set<string>
  onTogglePage: (id: string) => void
  onSelect: (id: string) => void
  onCreate: (folderId?: string) => void
  onCreateSubpage: (parentId: string) => void
  onNest: (docId: string, parentId: string) => void
  onNewFolder: () => void
  onRenameFolder: (folder: LocalFolder) => void
  onDeleteFolder: (folder: LocalFolder) => void
  onMoveToFolder: (docId: string, folderId?: string) => void
  onPickDestination: (docId: string) => void
  onTogglePin: (doc: LocalDocument) => void
  onDuplicate: (doc: LocalDocument) => void
  onTrash: (doc: LocalDocument) => void
  onOpenTrash: () => void
  onQuickFind: () => void
  onImport: () => void
  onBackup: () => void
}

export function DocumentSidebar(props: DocumentSidebarProps) {
  const { docs, tree, folders, activeId, titleOf, textOf, expandedFolders } = props
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const filtered = needle ? docs.filter(d => titleOf(d.title).toLowerCase().includes(needle) || textOf(d).toLowerCase().includes(needle)) : docs
  const pinned = docs.filter(d => d.isPinned)
  // Only top-level pages are filed in folders; sub-pages follow their parent.
  const loose = tree.roots.filter(d => !d.folderId || !folders.some(f => f.id === d.folderId))
  const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

  const dropProps = (key: string, folderId?: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return
      e.preventDefault()
      if (dragOver !== key) setDragOver(key)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null)
    },
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(DOC_DRAG_TYPE)
      setDragOver(null)
      setDragId(null)
      if (!id) return
      e.preventDefault()
      props.onMoveToFolder(id, folderId)
    },
  })

  const shared: PageRowShared = {
    tree,
    activeId,
    titleOf,
    expandedPages: props.expandedPages,
    menuFor,
    setMenuFor,
    dragId,
    setDragId,
    dragOver,
    setDragOver,
    onTogglePage: props.onTogglePage,
    onSelect: props.onSelect,
    onCreateSubpage: props.onCreateSubpage,
    onNest: props.onNest,
    onPickDestination: props.onPickDestination,
    onTogglePin: props.onTogglePin,
    onDuplicate: props.onDuplicate,
    onTrash: props.onTrash,
  }
  const flatRow = (d: LocalDocument) => <SidebarPageRow key={d.id} doc={d} flat shared={shared} />
  const treeRow = (d: LocalDocument) => <SidebarPageRow key={d.id} doc={d} shared={shared} />

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
            {filtered.map(flatRow)}
          </>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="sidebar-section">
                <div className="folders-section-header">{t('Favorites')}</div>
                {pinned.map(flatRow)}
              </section>
            )}

            {folders.length > 0 && (
              <section className="sidebar-section">
                <div className="folders-section-header">{t('Folders')}</div>
                {folders.map(f => {
                  const open = expandedFolders.has(f.id)
                  const inside = tree.roots.filter(d => d.folderId === f.id)
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
                          {inside.map(treeRow)}
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
              {loose.map(treeRow)}
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
