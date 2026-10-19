'use client'

import { createContext, useContext } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { GoogleIcon } from '../google-icon'
import { useI18n } from '@/lib/i18n'

export type LinkedPage = { title: string; icon?: string; status: 'live' | 'trash' | 'missing' }

/**
 * What a page-link block needs from the workspace: the live title/icon of the
 * page it points to, and a way to open it. Provided around <EditorContent>,
 * which renders React node views inside its own tree.
 */
export const PageDirectoryContext = createContext<{ lookup: (id: string) => LinkedPage; open: (id: string) => void }>({
  lookup: () => ({ title: '', status: 'missing' }),
  open: () => {},
})

export function PageLinkView({ node, selected }: NodeViewProps) {
  const { t } = useI18n()
  const { lookup, open } = useContext(PageDirectoryContext)
  const pageId: string = node.attrs.pageId ?? ''
  const page = lookup(pageId)
  const live = page.status === 'live'
  const title = live ? page.title : node.attrs.title || t('Untitled document')

  return (
    <NodeViewWrapper className={`page-link-block ${selected ? 'selected' : ''} ${live ? '' : 'gone'}`} data-type="page-link">
      <button
        type="button"
        className="page-link-btn"
        contentEditable={false}
        disabled={!live}
        onClick={() => live && open(pageId)}
        title={live ? t('Open page') : t(page.status === 'trash' ? 'This page is in Trash' : 'This page was deleted')}
      >
        <span className="page-link-icon">{live && page.icon ? page.icon : <GoogleIcon name={live ? 'description' : 'link_off'} size={18} />}</span>
        <span className="page-link-title">{title}</span>
        {!live && <span className="page-link-note">{t(page.status === 'trash' ? 'In Trash' : 'Deleted page')}</span>}
      </button>
    </NodeViewWrapper>
  )
}
