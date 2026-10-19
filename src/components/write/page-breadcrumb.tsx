'use client'

import { GoogleIcon } from '../google-icon'
import { MenuButton } from '../menu-button'
import { useI18n } from '@/lib/i18n'
import type { LocalDocument, LocalFolder } from '@/lib/models'

/** Ancestors shown before collapsing the middle of a long path into "…". */
const MAX_VISIBLE_ANCESTORS = 3

/**
 * Header path: folder (or Pages) / every parent page / current page. Parents
 * open on click; long chains keep the first and the last two parents and put
 * the rest in a "…" menu. Narrow screens show only the direct parent.
 */
export function PageBreadcrumb({
  page,
  ancestors,
  folder,
  titleOf,
  onOpen,
  onMove,
}: {
  page: LocalDocument
  ancestors: LocalDocument[]
  folder?: LocalFolder
  titleOf: (title: string) => string
  onOpen: (id: string) => void
  onMove: () => void
}) {
  const { t } = useI18n()
  const collapse = ancestors.length > MAX_VISIBLE_ANCESTORS
  const hidden = collapse ? ancestors.slice(1, -2) : []
  const head = collapse ? ancestors.slice(0, 1) : ancestors
  const tail = collapse ? ancestors.slice(-2) : []
  const parentId = ancestors[ancestors.length - 1]?.id

  const crumb = (d: LocalDocument) => (
    <span key={d.id} className={`breadcrumb-step ${d.id === parentId ? 'is-parent' : ''}`}>
      <button type="button" className="breadcrumb-btn" onClick={() => onOpen(d.id)} title={titleOf(d.title)}>
        {d.icon ? <span className="breadcrumb-emoji">{d.icon}</span> : <GoogleIcon name="description" size={15} />}
        <span>{titleOf(d.title)}</span>
      </button>
      <span className="breadcrumb-sep">/</span>
    </span>
  )

  return (
    <nav className="header-breadcrumb" aria-label={t('Location')}>
      <span className="breadcrumb-step breadcrumb-home">
        <button type="button" className="breadcrumb-btn" onClick={onMove} title={t('Move to')}>
          <GoogleIcon name={folder ? 'folder' : 'description'} size={15} />
          <span>{folder ? folder.title : t('Pages')}</span>
        </button>
        <span className="breadcrumb-sep">/</span>
      </span>
      {head.map(crumb)}
      {collapse && (
        <span className="breadcrumb-step breadcrumb-more">
          <MenuButton
            variant="icon"
            triggerClassName="breadcrumb-btn"
            label={t('Show full path')}
            icon={<GoogleIcon name="more_horiz" size={16} />}
            items={hidden.map(d => ({ label: titleOf(d.title), icon: d.icon ?? <GoogleIcon name="description" size={16} />, onSelect: () => onOpen(d.id) }))}
          />
          <span className="breadcrumb-sep">/</span>
        </span>
      )}
      {tail.map(crumb)}
      <span className="breadcrumb-current">
        {page.icon && <span className="breadcrumb-emoji">{page.icon}</span>}
        {titleOf(page.title)}
      </span>
    </nav>
  )
}
