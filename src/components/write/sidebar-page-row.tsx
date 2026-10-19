'use client'

import { GoogleIcon } from '../google-icon'
import { MenuButton } from '../menu-button'
import { useI18n } from '@/lib/i18n'
import { timeAgo } from '@/lib/time'
import { canNest, type PageTree } from '@/lib/page-tree'
import type { LocalDocument } from '@/lib/models'

/** Drag payload type shared by page rows, folders and the Pages zone. */
export const DOC_DRAG_TYPE = 'application/x-my-space-doc'

export type PageRowShared = {
  tree: PageTree
  activeId: string
  titleOf: (title: string) => string
  expandedPages: Set<string>
  menuFor: string | null
  setMenuFor: (id: string | null) => void
  /** Page being dragged (dataTransfer can't be read during dragover). */
  dragId: string | null
  setDragId: (id: string | null) => void
  dragOver: string | null
  setDragOver: (key: string | null) => void
  onTogglePage: (id: string) => void
  onSelect: (id: string) => void
  onCreateSubpage: (parentId: string) => void
  onNest: (docId: string, parentId: string) => void
  onPickDestination: (docId: string) => void
  onTogglePin: (doc: LocalDocument) => void
  onDuplicate: (doc: LocalDocument) => void
  onTrash: (doc: LocalDocument) => void
}

/**
 * One page in the sidebar and, when expanded, its sub-pages (recursively).
 * The chevron expands, "+" adds a sub-page, and dropping another page on the
 * row nests it here. `flat` rows (Favorites, filter results) show no tree.
 */
export function SidebarPageRow({ doc: d, depth = 0, flat = false, shared: s }: { doc: LocalDocument; depth?: number; flat?: boolean; shared: PageRowShared }) {
  const { t } = useI18n()
  const active = d.id === s.activeId
  const kids = s.tree.children.get(d.id) ?? []
  const open = !flat && s.expandedPages.has(d.id)
  const dropKey = `page:${d.id}`

  return (
    <div className="page-node">
      <div
        className={`document-row page-row ${active ? 'active' : ''} ${s.menuFor === d.id ? 'menu-open' : ''} ${s.dragOver === dropKey ? 'drop-into' : ''}`}
        style={{ '--depth': depth } as React.CSSProperties}
        draggable
        onDragStart={e => {
          e.stopPropagation()
          e.dataTransfer.setData(DOC_DRAG_TYPE, d.id)
          e.dataTransfer.effectAllowed = 'move'
          s.setDragId(d.id)
        }}
        onDragEnd={() => {
          s.setDragId(null)
          s.setDragOver(null)
        }}
        onDragOver={e => {
          if (!s.dragId || !e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return
          // Over itself or its own sub-pages nothing can be dropped (and the folder below must not take it).
          e.stopPropagation()
          if (!canNest(s.tree, s.dragId, d.id)) return
          e.preventDefault()
          if (s.dragOver !== dropKey) s.setDragOver(dropKey)
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node) && s.dragOver === dropKey) s.setDragOver(null)
        }}
        onDrop={e => {
          const id = e.dataTransfer.getData(DOC_DRAG_TYPE)
          e.stopPropagation()
          s.setDragOver(null)
          s.setDragId(null)
          if (!id || !canNest(s.tree, id, d.id)) return
          e.preventDefault()
          s.onNest(id, d.id)
        }}
      >
        {!flat && (
          <button
            type="button"
            className={`page-chevron ${kids.length ? '' : 'leaf'}`}
            onClick={() => s.onTogglePage(d.id)}
            aria-expanded={open}
            aria-label={t(open ? 'Collapse' : 'Expand')}
            tabIndex={kids.length ? 0 : -1}
          >
            <GoogleIcon name="chevron_right" size={16} className={`folder-chevron ${open ? 'open' : ''}`} />
          </button>
        )}
        <button
          type="button"
          className="doc-select-btn"
          onClick={() => s.onSelect(d.id)}
          aria-current={active ? 'true' : undefined}
          title={`${s.titleOf(d.title)} · ${timeAgo(d.updatedAt)}`}
        >
          <span className="doc-icon">{d.icon ?? <GoogleIcon name="description" size={17} />}</span>
          <span className="doc-title">{s.titleOf(d.title)}</span>
        </button>
        <div className="doc-actions">
          <MenuButton
            variant="icon"
            triggerClassName="doc-action-btn"
            label={t('More actions')}
            icon={<GoogleIcon name="more_horiz" size={17} />}
            onOpenChange={o => s.setMenuFor(o ? d.id : null)}
            items={[
              { label: d.isPinned ? t('Remove from Favorites') : t('Add to Favorites'), icon: <GoogleIcon name="star" size={16} fill={d.isPinned} />, onSelect: () => s.onTogglePin(d) },
              { label: t('Duplicate'), icon: <GoogleIcon name="content_copy" size={16} />, onSelect: () => s.onDuplicate(d) },
              { label: t('Move to'), icon: <GoogleIcon name="drive_file_move" size={16} />, onSelect: () => s.onPickDestination(d.id) },
              'separator',
              { label: t('Move to Trash'), icon: <GoogleIcon name="delete" size={16} />, danger: true, onSelect: () => s.onTrash(d) },
            ]}
          />
          <button type="button" className="doc-action-btn" onClick={() => s.onCreateSubpage(d.id)} aria-label={t('Add a page inside')} title={t('Add a page inside')}>
            <GoogleIcon name="add" size={17} />
          </button>
        </div>
      </div>
      {open && (
        <div className="page-children" role="group">
          {kids.map(k => (
            <SidebarPageRow key={k.id} doc={k} depth={depth + 1} shared={s} />
          ))}
          {!kids.length && (
            <div className="page-children-empty" style={{ '--depth': depth + 1 } as React.CSSProperties}>
              {t('No pages inside')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
