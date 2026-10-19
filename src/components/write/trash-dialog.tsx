'use client'

import { useState } from 'react'
import { GoogleIcon } from '../google-icon'
import { Modal } from '../modal'
import { useI18n } from '@/lib/i18n'
import { timeAgo } from '@/lib/time'
import type { LocalDocument } from '@/lib/models'

/** Days a page stays in Trash before it is removed for good on next load. */
export const TRASH_RETENTION_DAYS = 30

/**
 * Trash: restore pages or delete them permanently. Deleting forever and
 * emptying the trash both ask once more, since they can't be undone.
 */
export function TrashDialog({
  items,
  titleOf,
  onRestore,
  onDeleteForever,
  onEmpty,
  onClose,
}: {
  items: LocalDocument[]
  titleOf: (title: string) => string
  onRestore: (doc: LocalDocument) => void
  onDeleteForever: (doc: LocalDocument) => void
  onEmpty: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<string | 'all' | null>(null)
  const needle = query.trim().toLowerCase()
  const shown = items
    .filter(d => !needle || titleOf(d.title).toLowerCase().includes(needle))
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))

  return (
    <Modal title={t('Trash')} onClose={onClose}>
      {items.length > 0 && (
        <label className="search trash-search">
          <GoogleIcon name="search" size={17} className="search-icon" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Filter by page title…')} aria-label={t('Filter by page title…')} />
        </label>
      )}

      <div className="trash-list">
        {!items.length && (
          <div className="trash-empty">
            <GoogleIcon name="delete" size={28} />
            <p>{t('Trash is empty')}</p>
          </div>
        )}
        {shown.map(doc => (
          <div key={doc.id} className="trash-row">
            <span className="trash-icon">{doc.icon ?? <GoogleIcon name="description" size={16} />}</span>
            <span className="trash-title">
              <strong>{titleOf(doc.title)}</strong>
              <small>{t('Deleted {when}', { when: doc.deletedAt ? timeAgo(doc.deletedAt) : '' })}</small>
            </span>
            {confirming === doc.id ? (
              <>
                <button type="button" className="button danger small" onClick={() => { onDeleteForever(doc); setConfirming(null) }}>
                  {t('Delete forever')}
                </button>
                <button type="button" className="icon-button" onClick={() => setConfirming(null)} aria-label={t('Cancel')}>
                  <GoogleIcon name="close" size={16} />
                </button>
              </>
            ) : (
              <>
                <button type="button" className="icon-button" onClick={() => onRestore(doc)} title={t('Restore')} aria-label={t('Restore {title}', { title: titleOf(doc.title) })}>
                  <GoogleIcon name="restore_page" size={18} />
                </button>
                <button type="button" className="icon-button trash-delete" onClick={() => setConfirming(doc.id)} title={t('Delete forever')} aria-label={t('Delete forever')}>
                  <GoogleIcon name="delete_forever" size={18} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="trash-note">{t('Pages in Trash are deleted permanently after {n} days.', { n: TRASH_RETENTION_DAYS })}</p>

      {items.length > 0 && (
        <div className="modal-footer">
          {confirming === 'all' ? (
            <>
              <button type="button" className="button" onClick={() => setConfirming(null)}>
                {t('Cancel')}
              </button>
              <button type="button" className="button danger" onClick={() => { onEmpty(); setConfirming(null) }}>
                {t('Delete {n} pages forever', { n: items.length })}
              </button>
            </>
          ) : (
            <button type="button" className="button danger" onClick={() => setConfirming('all')}>
              <GoogleIcon name="delete_sweep" size={16} /> {t('Empty trash')}
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
