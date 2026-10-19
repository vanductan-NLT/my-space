'use client'

import { BubbleMenu, EditorContent, generateJSON, useEditor } from '@tiptap/react'
import { fontFamily } from './fonts'
import { InlineFontChips, PageFontButton } from './font-controls'
import { AlignButtons, BubbleDropdown, ColorPanel, currentBlockLabel, MoreButtons, SizeButtons, TurnInto } from './format-controls'
import { GoogleIcon } from '../google-icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db, exportBackup, importBackup, isQuotaError, parseBackup } from '@/lib/db'
import { useAutosave } from '@/lib/use-autosave'
import { looksLikeMarkdown, markdownToHtml, normalizePastedMarkdown, toMarkdown } from '@/lib/markdown'
import { imageFileToDataUrl, isImageFile } from '@/lib/images'
import type { EditorView } from '@tiptap/pm/view'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { writeExtensions } from './editor-extensions'
import { SlashMenu } from './slash-menu'
import { Dictation } from './dictation'
import { CaptureScreenButton } from '../screen-capture'
import { KeyboardBar } from './keyboard-bar'
import { NodeSelection } from '@tiptap/pm/state'
import { Modal } from '../modal'
import { SaveIndicator } from '../save-indicator'
import { MenuButton } from '../menu-button'
import { DocumentSidebar } from './document-sidebar'
import { QuickFindPalette } from './quick-find-palette'
import { TrashDialog, TRASH_RETENTION_DAYS } from './trash-dialog'
import { PageIconPicker } from './page-icon-picker'
import { BlockHandle } from './block-handle'
import { EMPTY_CONTENT, newDocument, newFolder, type LocalDocument, type LocalFolder, type SaveState } from '@/lib/models'
import { detectLang, getLang, rich, translate, useI18n } from '@/lib/i18n'
import './write.css'
import './notion-features.css'
import { FullModeButton, useFullMode } from '../full-mode'

const download = (name: string, text: string, type = 'application/json') => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

const plainText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  const n = node as { text?: string; content?: unknown[] }
  return n.text ?? (n.content?.map(plainText).join(' ') ?? '')
}

// Shortcut hint prefix; only called in client-rendered UI.
const mod = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+')

// Below this width the document list is an overlay, not a column.
const isNarrow = () => window.matchMedia('(max-width: 700px)').matches

export default function WritingWorkspace() {
  const { t } = useI18n()
  // Untitled documents keep the default name in whatever language is shown.
  const titleOf = (title: string) => (!title || title === 'Untitled document' || title === 'Tài liệu chưa đặt tên' ? t('Untitled document') : title)
  const [docs, setDocs] = useState<LocalDocument[]>([])
  // Documents with `deletedAt`, kept apart so every list and search ignores them.
  const [trash, setTrash] = useState<LocalDocument[]>([])
  const [trashOpen, setTrashOpen] = useState(false)
  const [quickFindOpen, setQuickFindOpen] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [folders, setFolders] = useState<LocalFolder[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [folderToRename, setFolderToRename] = useState<LocalFolder | null>(null)
  const [renameFolderTitle, setRenameFolderTitle] = useState('')
  const [movingDocId, setMovingDocId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState<SaveState>('idle')
  const [sidebar, setSidebar] = useState(true)
  const { active: focus } = useFullMode()
  const [notice, setNotice] = useState<{ text: string; error?: boolean; offerExport?: boolean; action?: { label: string; run: () => void } } | null>(null)

  // New folder dialog state
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Safe delete folder state
  const [folderToDelete, setFolderToDelete] = useState<LocalFolder | null>(null)
  const [deleteWithDocs, setDeleteWithDocs] = useState(false)

  // Link dialog state
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // Bumped when the active document is replaced from outside the editor (e.g. backup import).
  const [contentVersion, setContentVersion] = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)
  const imageFileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const focusTitleNext = useRef(false)

  // Confirmations fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (!notice || notice.error) return
    const t = setTimeout(() => setNotice(null), notice.action ? 7000 : 4000)
    return () => clearTimeout(t)
  }, [notice])
  const active = docs.find(d => d.id === activeId)
  const activeFolder = active?.folderId ? folders.find(f => f.id === active.folderId) : undefined

  const autosave = useAutosave<Partial<Pick<LocalDocument, 'title' | 'content' | 'font' | 'icon' | 'fullWidth'>>>({
    delay: 650,
    write: async (id, patch) => {
      const title = patch.title === undefined ? {} : { title: patch.title.trim() || t('Untitled document') }
      await db.documents.update(id, { ...patch, ...title, updatedAt: new Date().toISOString() })
    },
    onSaving: () => setSave('saving'),
    onSaved: id => {
      const updatedAt = new Date().toISOString()
      setDocs(old => old.map(d => (d.id === id ? { ...d, updatedAt } : d)))
      setSave('saved')
    },
    onError: err => {
      setSave('error')
      setNotice({
        text: isQuotaError(err)
          ? 'Browser storage is full. Export a backup now; your open work remains available.'
          : 'Save failed. Export your work before closing this tab.',
        error: true,
        offerExport: true,
      })
    },
  })

  const refresh = useCallback(async (id?: string) => {
    const stored = await db.documents.orderBy('updatedAt').reverse().toArray()
    const all = stored.filter(d => !d.deletedAt)
    const allFolders = await db.folders.toArray()
    setFolders(allFolders.sort((a, b) => (a.createdAt || a.updatedAt).localeCompare(b.createdAt || b.updatedAt)))
    setDocs(all)
    setTrash(stored.filter(d => d.deletedAt))
    const wanted = id || localStorage.getItem('my-space:last-document') || all[0]?.id
    setActiveId(wanted && all.some(d => d.id === wanted) ? wanted : (all[0]?.id ?? ''))
  }, [])

  useEffect(() => {
    if (isNarrow()) setSidebar(false)
    if (!('indexedDB' in window)) {
      setNotice({ text: translate('IndexedDB is unavailable. Work cannot be saved in this browser.', undefined, detectLang()), error: true })
      setLoading(false)
      return
    }

    void (async () => {
      try {
        // Pages that sat in Trash longer than the retention window are removed for good.
        const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86400000
        const expired = (await db.documents.toArray()).filter(d => d.deletedAt && Date.parse(d.deletedAt) < cutoff)
        if (expired.length) await db.documents.bulkDelete(expired.map(d => d.id))
        let all = await db.documents.toArray()
        const allFolders = await db.folders.toArray()
        setFolders(allFolders.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        if (!all.length) {
          // Fixed id + put: seeding twice (StrictMode, two tabs) can't create duplicates.
          const tt = (key: string) => translate(key, undefined, detectLang())
          const first = { ...newDocument(tt('Welcome to My Space')), id: 'welcome' }
          first.content = {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: tt('A quiet place for clear thinking.') }],
              },
              {
                type: 'callout',
                attrs: { icon: '💡' },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: tt('Everything you write stays in this browser. Type “/” for blocks, or select text to format it.') }],
                  },
                ],
              },
            ],
          }
          await db.documents.put(first)
          all = [first]
        }
        await refresh()
        setSave('saved')
      } catch {
        setNotice({ text: translate('Local storage could not be opened. Your current work will remain on screen.', undefined, detectLang()), error: true })
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  const insertImages = async (view: EditorView, files: File[], at?: number) => {
    for (const file of files) {
      try {
        const src = await imageFileToDataUrl(file)
        const node = view.state.schema.nodes.image.create({ src, alt: file.name.replace(/\.[^.]+$/, '') })
        const pos = at ?? view.state.selection.from
        view.dispatch(at === undefined ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(pos, node))
        view.focus()
      } catch (err) {
        setNotice({ text: err instanceof Error && err.message ? t(err.message) : t('That image could not be added.'), error: true })
      }
    }
  }

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: writeExtensions,
      content: active?.content ?? EMPTY_CONTENT,
      editorProps: {
        attributes: { class: 'prose-editor', 'aria-label': translate('Document content', undefined, getLang()) },
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile)
          if (files.length) {
            event.preventDefault()
            void insertImages(view, files)
            return true
          }

          const clipboard = event.clipboardData
          const text = clipboard?.getData('text/plain') ?? ''
          if (looksLikeMarkdown(text)) {
            event.preventDefault()
            const html = markdownToHtml(normalizePastedMarkdown(text))
            const container = document.createElement('div')
            container.innerHTML = html
            const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container)
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
            return true
          }

          return false
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = [...(event.dataTransfer?.files ?? [])].filter(isImageFile)
          if (moved || !files.length) return false
          event.preventDefault()
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          void insertImages(view, files, at)
          return true
        },
      },
      onUpdate: ({ editor: e }) => {
        if (!activeId) return
        const content = e.getJSON()
        setDocs(old => old.map(d => (d.id === activeId ? { ...d, content } : d)))
        autosave.queue(activeId, { content })
      },
    },
    [activeId, contentVersion]
  )

  useEffect(() => {
    if (activeId) localStorage.setItem('my-space:last-document', activeId)
  }, [activeId])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)')
    const onChange = () => query.matches && setSidebar(false)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [active?.title, active?.id, active?.fullWidth, editor])

  useEffect(() => {
    if (!focusTitleNext.current || !editor) return
    focusTitleNext.current = false
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [editor])

  const selectDocument = (id: string) => {
    if (isNarrow()) setSidebar(false)
    if (id === activeId) return
    void autosave.flush()
    setActiveId(id)
  }

  // Link Dialog open helper
  const openLinkDialog = useCallback(() => {
    if (!editor) return
    const current = editor.getAttributes('link').href || ''
    setLinkUrl(current)
    setLinkOpen(true)
  }, [editor])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const command = e.metaKey || e.ctrlKey
      if (command && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openLinkDialog()
      } else if (command && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        // Quick Find replaces the browser's print shortcut here; printing stays in the page menu.
        e.preventDefault()
        setQuickFindOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openLinkDialog])

  const togglePin = async (d: LocalDocument) => {
    await db.documents.update(d.id, { isPinned: !d.isPinned })
    await refresh(activeId)
  }

  const handleRenameFolder = async () => {
    if (!folderToRename) return
    const title = renameFolderTitle.trim()
    if (!title) return
    const folderId = folderToRename.id
    setFolders(prev => prev.map(f => (f.id === folderId ? { ...f, title, updatedAt: new Date().toISOString() } : f)))
    setFolderToRename(null)
    setRenameFolderTitle('')
    await db.folders.update(folderId, { title, updatedAt: new Date().toISOString() })
    await refresh(activeId)
    setNotice({ text: t('Renamed folder to "{title}"', { title }) })
  }

  const handleCreateFolder = async () => {
    const title = newFolderName.trim() || t('New folder')
    const f = newFolder(title)
    await db.folders.add(f)
    setExpandedFolders(prev => new Set(prev).add(f.id))
    setNewFolderOpen(false)
    setNewFolderName('')
    await refresh(activeId)
    setNotice({ text: t('Created folder "{title}"', { title: f.title }) })
  }

  const create = async (folderId?: string, title?: string) => {
    await autosave.flush()
    const d = { ...newDocument(title || t('Untitled document')), folderId }
    await db.documents.add(d)
    if (folderId) {
      setExpandedFolders(prev => new Set(prev).add(folderId))
    }
    if (isNarrow()) setSidebar(false)
    focusTitleNext.current = !title
    await refresh(d.id)
  }

  const patchActive = (patch: Partial<Pick<LocalDocument, 'icon' | 'fullWidth'>>) => {
    if (!active) return
    setDocs(v => v.map(d => (d.id === active.id ? { ...d, ...patch } : d)))
    autosave.queue(active.id, patch)
  }

  const moveToFolder = async (docId: string, folderId?: string) => {
    await db.documents.update(docId, { folderId, updatedAt: new Date().toISOString() })
    if (folderId) setExpandedFolders(prev => new Set(prev).add(folderId))
    await refresh(activeId)
    const doc = docs.find(d => d.id === docId)
    const folder = folders.find(f => f.id === folderId)
    if (doc) setNotice({ text: t('Moved "{title}" to "{folder}"', { title: titleOf(doc.title), folder: folder?.title ?? t('Pages') }) })
  }

  /** Soft delete: the page goes to Trash and can be restored (or undone right away). */
  const moveToTrash = async (d: LocalDocument) => {
    await autosave.flush()
    await db.documents.update(d.id, { deletedAt: new Date().toISOString() })
    const next = d.id === activeId ? docs.find(x => x.id !== d.id)?.id : activeId
    await refresh(next)
    setNotice({ text: t('Moved "{title}" to Trash', { title: titleOf(d.title) }), action: { label: t('Undo'), run: () => void restore(d, true) } })
  }

  const restore = async (d: LocalDocument, open = false) => {
    // A page whose folder was deleted meanwhile comes back as a loose page.
    const folderId = d.folderId && (await db.folders.get(d.folderId)) ? d.folderId : undefined
    await db.documents.update(d.id, { deletedAt: undefined, folderId })
    await refresh(open ? d.id : activeId || d.id)
    if (!open) setNotice({ text: t('Restored "{title}"', { title: titleOf(d.title) }) })
    else setNotice(null)
  }

  const deleteForever = async (ids: string[]) => {
    await db.documents.bulkDelete(ids)
    await refresh(activeId)
  }

  const updateTitle = (title: string) => {
    if (!active) return
    setDocs(v => v.map(d => (d.id === active.id ? { ...d, title } : d)))
    autosave.queue(active.id, { title })
  }

  const duplicate = async (d: LocalDocument) => {
    await autosave.flush()
    const copy = {
      ...d,
      id: crypto.randomUUID(),
      title: t('{title} (Copy)', { title: titleOf(d.title) }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await db.documents.add(copy)
    await refresh(copy.id)
    setNotice({ text: t('Duplicated "{title}"', { title: copy.title }) })
  }

  const handleSafeDeleteFolder = async () => {
    if (!folderToDelete) return
    const f = folderToDelete
    const docsInFolder = docs.filter(d => d.folderId === f.id)

    if (deleteWithDocs) {
      // Notes go to Trash rather than vanishing, so a mis-click is recoverable.
      const deletedAt = new Date().toISOString()
      for (const d of docsInFolder) {
        await db.documents.update(d.id, { deletedAt })
      }
    } else {
      for (const d of docsInFolder) {
        await db.documents.update(d.id, { folderId: undefined, updatedAt: new Date().toISOString() })
      }
    }

    await db.folders.delete(f.id)
    setFolderToDelete(null)
    setDeleteWithDocs(false)
    await refresh(deleteWithDocs && docsInFolder.some(d => d.id === activeId) ? undefined : activeId)
    setNotice({ text: t('Deleted "{title}"', { title: f.title }) })
  }

  const backup = async () => {
    const stored = await exportBackup().catch(() => null)
    const data = { format: 'my-space-backup' as const, version: 1 as const, exportedAt: new Date().toISOString(), documents: docs, boards: stored?.boards ?? [], folders }
    download(`my-space-${data.exportedAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2))
  }

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const raw = await file.text()
      if (file.name.endsWith('.json')) {
        const data = parseBackup(JSON.parse(raw))
        await autosave.flush()
        const result = await importBackup(data)
        await refresh()
        setContentVersion(v => v + 1)
        const restored = result.added + result.updated
        const parts = [
          restored ? t(restored === 1 ? 'Restored {n} item.' : 'Restored {n} items.', { n: restored }) : '',
          result.keptAsCopy
            ? t(
                result.keptAsCopy === 1
                  ? '{n} item had newer edits here, so the backup version was added as a “(from backup)” copy.'
                  : '{n} items had newer edits here, so the backup version was added as a “(from backup)” copy.',
                { n: result.keptAsCopy }
              )
            : '',
        ]
        setNotice({ text: parts.filter(Boolean).join(' ') || 'The backup was empty.' })
      } else {
        const d = newDocument(file.name.replace(/\.[^.]+$/, ''))
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (ext === 'md' || ext === 'markdown') {
          d.content = generateJSON(markdownToHtml(raw), writeExtensions)
        } else if (ext === 'html' || ext === 'htm') {
          d.content = generateJSON(raw, writeExtensions)
        } else {
          d.content = {
            type: 'doc',
            content: raw.split(/\n{2,}/).map(p => ({
              type: 'paragraph',
              content: p ? [{ type: 'text', text: p }] : undefined,
            })),
          }
        }
        await autosave.flush()
        await db.documents.add(d)
        await refresh(d.id)
        setNotice({ text: t('Document imported.') })
      }
    } catch (err) {
      setNotice({
        text: err instanceof SyntaxError || !(err instanceof Error)
          ? t('This file could not be read. Choose a My Space backup (.json) or a .md, .txt or .html file.')
          : t(err.message),
        error: true,
      })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const applyLink = () => {
    if (!editor) return
    const trimmed = linkUrl.trim()
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      const url = /^(https?:|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`
      if (editor.state.selection.empty && !editor.isActive('link')) {
        editor
          .chain()
          .focus()
          .insertContent([{ type: 'text', text: trimmed, marks: [{ type: 'link', attrs: { href: url } }] }, { type: 'text', text: ' ' }])
          .run()
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      }
    }
    setLinkOpen(false)
  }

  const removeLink = () => {
    if (editor) {
      editor.chain().focus().unsetLink().run()
    }
    setLinkOpen(false)
  }

  const textOf = useCallback((d: LocalDocument) => plainText(d.content), [])
  const words = plainText(active?.content).trim().split(/\s+/).filter(Boolean).length
  const chars = plainText(active?.content).length

  const exportActive = (format: string) => {
    if (!active || !editor || !format) return
    const safe = titleOf(active.title).replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'document'
    if (format === 'html') {
      const font = fontFamily(active.font)
      download(`${safe}.html`, `<!doctype html><meta charset="utf-8"><title>${safe}</title><article${font ? ` style="font-family: ${font.replace(/"/g, "'")}"` : ''}>${editor.getHTML()}</article>`, 'text/html')
    }
    if (format === 'txt') {
      download(`${safe}.txt`, editor.getText(), 'text/plain')
    }
    if (format === 'md') {
      download(`${safe}.md`, toMarkdown(editor.getJSON()), 'text/markdown')
    }
  }

  if (loading) {
    return (
      <div className="center-state">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className={`writing ${sidebar ? '' : 'sidebar-hidden'} ${focus ? 'focus' : ''}`}>
      <DocumentSidebar
        docs={docs}
        folders={folders}
        activeId={activeId}
        trashCount={trash.length}
        titleOf={titleOf}
        textOf={textOf}
        expandedFolders={expandedFolders}
        onToggleFolder={id =>
          setExpandedFolders(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
        onSelect={selectDocument}
        onCreate={folderId => void create(folderId)}
        onNewFolder={() => {
          setNewFolderName('')
          setNewFolderOpen(true)
        }}
        onRenameFolder={f => {
          setFolderToRename(f)
          setRenameFolderTitle(f.title)
        }}
        onDeleteFolder={f => {
          setFolderToDelete(f)
          setDeleteWithDocs(false)
        }}
        onMoveToFolder={(id, folderId) => void moveToFolder(id, folderId)}
        onPickFolder={setMovingDocId}
        onTogglePin={d => void togglePin(d)}
        onDuplicate={d => void duplicate(d)}
        onTrash={d => void moveToTrash(d)}
        onOpenTrash={() => setTrashOpen(true)}
        onQuickFind={() => setQuickFindOpen(true)}
        onImport={() => fileRef.current?.click()}
        onBackup={() => void backup()}
      />
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept=".json,.md,.markdown,.txt,.html,.htm"
        onChange={e => void importFile(e.target.files?.[0])}
      />

      {sidebar && <button type="button" className="panel-scrim" aria-label={t('Close documents')} onClick={() => setSidebar(false)} />}

      {/* Main Writer Area */}
      <section className="writer">
        <header className="write-header">
          <button
            className="icon-button"
            onClick={() => setSidebar(v => !v)}
            aria-label={t(sidebar ? 'Hide documents sidebar' : 'Show documents sidebar')}
            title={t(sidebar ? 'Hide sidebar' : 'Show sidebar')}
          >
            <GoogleIcon name={sidebar ? 'dock_to_left' : 'menu_open'} size={20} />
          </button>

          {active && (
            <nav className="header-breadcrumb" aria-label={t('Location')}>
              <button type="button" className="breadcrumb-btn" onClick={() => setMovingDocId(active.id)} title={t('Move to folder')}>
                <GoogleIcon name={activeFolder ? 'folder' : 'description'} size={15} />
                <span>{activeFolder ? activeFolder.title : t('Pages')}</span>
              </button>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">
                {active.icon && <span className="breadcrumb-emoji">{active.icon}</span>}
                {titleOf(active.title)}
              </span>
            </nav>
          )}

          <SaveIndicator state={save} />

          <div className="header-actions">
            {active && (
              <PageFontButton
                font={active.font ?? 'default'}
                onChange={font => {
                  setDocs(v => v.map(d => (d.id === active.id ? { ...d, font } : d)))
                  autosave.queue(active.id, { font })
                }}
              />
            )}

            <CaptureScreenButton
              onImage={file => editor && void insertImages(editor.view, [file])}
              onError={text => setNotice({ text, error: true })}
            />

            <Dictation editor={editor} onError={text => setNotice({ text, error: true })} />

            <FullModeButton kind="focus" />

            {active && (
              <MenuButton
                variant="icon"
                label={t('Page options')}
                icon={<GoogleIcon name="more_horiz" size={20} />}
                items={[
                  { label: t('Full width'), icon: <GoogleIcon name="width_full" size={16} />, checked: !!active.fullWidth, onSelect: () => patchActive({ fullWidth: !active.fullWidth }) },
                  { label: active.isPinned ? t('Remove from Favorites') : t('Add to Favorites'), icon: <GoogleIcon name="star" size={16} fill={active.isPinned} />, onSelect: () => void togglePin(active) },
                  { label: t('Duplicate'), icon: <GoogleIcon name="content_copy" size={16} />, onSelect: () => void duplicate(active) },
                  { label: t('Move to folder'), icon: <GoogleIcon name="drive_file_move" size={16} />, onSelect: () => setMovingDocId(active.id) },
                  'separator',
                  { label: t('Export as Markdown'), hint: '.md', icon: <GoogleIcon name="download" size={16} />, onSelect: () => exportActive('md') },
                  { label: t('Export as plain text'), hint: '.txt', icon: <GoogleIcon name="download" size={16} />, onSelect: () => exportActive('txt') },
                  { label: t('Export as web page'), hint: '.html', icon: <GoogleIcon name="download" size={16} />, onSelect: () => exportActive('html') },
                  { label: t('Print or save as PDF'), icon: <GoogleIcon name="print" size={16} />, onSelect: () => window.print() },
                  'separator',
                  { label: t('Move to Trash'), icon: <GoogleIcon name="delete" size={16} />, danger: true, onSelect: () => void moveToTrash(active) },
                ]}
              />
            )}
          </div>
        </header>

        {/* Formatting Toolbar for mobile */}
        {editor && <KeyboardBar editor={editor} onOpenLink={openLinkDialog} onPickImage={() => imageFileRef.current?.click()} />}
        <input
          ref={imageFileRef}
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          onChange={e => {
            const files = [...(e.target.files ?? [])]
            if (editor && files.length) void insertImages(editor.view, files)
            e.target.value = ''
          }}
        />

        {/* Scrollable Editor Container */}
        <div
          className="editor-scroll"
          onMouseDown={e => {
            // Clicking the empty space around/below the page puts the caret at the end, like Notion.
            if (!editor || !(e.target instanceof HTMLElement)) return
            if (e.target === e.currentTarget || e.target.classList.contains('page') || e.target.classList.contains('editor-tail')) {
              e.preventDefault()
              editor.chain().focus('end').run()
            }
          }}
        >
          {active ? (
            <article
              className={`page ${fontFamily(active.font) ? 'has-font' : ''} ${active.fullWidth ? 'full-width' : ''}`}
              style={{ '--doc-font': fontFamily(active.font) ?? undefined } as React.CSSProperties}
            >
              <div className={`page-header ${active.icon ? 'has-icon' : ''}`}>
                {active.icon && (
                  <button type="button" className="page-icon" onClick={() => setIconPickerOpen(v => !v)} title={t('Change icon')} aria-label={t('Change icon')}>
                    {active.icon}
                  </button>
                )}
                <div className="page-controls">
                  {!active.icon && (
                    <button type="button" className="page-control" onClick={() => setIconPickerOpen(v => !v)}>
                      <GoogleIcon name="add_reaction" size={16} /> {t('Add icon')}
                    </button>
                  )}
                  <button type="button" className="page-control width-toggle" onClick={() => patchActive({ fullWidth: !active.fullWidth })}>
                    <GoogleIcon name={active.fullWidth ? 'width_normal' : 'width_full'} size={16} /> {t(active.fullWidth ? 'Normal width' : 'Full width')}
                  </button>
                </div>
                {iconPickerOpen && (
                  <PageIconPicker
                    current={active.icon}
                    onPick={icon => {
                      patchActive({ icon })
                      setIconPickerOpen(false)
                    }}
                    onClose={() => setIconPickerOpen(false)}
                  />
                )}
              </div>

              <textarea
                ref={titleRef}
                className="title-input"
                rows={1}
                value={active.title}
                onChange={e => updateTitle(e.target.value.replace(/\n/g, ' '))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && editor) {
                    e.preventDefault()
                    editor.commands.focus('start')
                    editor.view.focus()
                  }
                }}
                aria-label={t('Document title')}
                placeholder={t('Untitled document')}
              />

              {editor && (
                <>
                  {/* Select text → formatting bubble */}
                  <BubbleMenu
                    editor={editor}
                    pluginKey="formatBubble"
                    className="bubble"
                    shouldShow={({ state }) =>
                      !state.selection.empty && !(state.selection instanceof NodeSelection) && !editor.isActive('codeBlock')
                    }
                  >
                    <BubbleDropdown label={<span className="bubble-dd-text">{t(currentBlockLabel(editor))}</span>} title={t('Turn into')}>
                      {close => <TurnInto editor={editor} onDone={close} />}
                    </BubbleDropdown>
                    <span className="separator" />
                    <Tool label={t('Bold')} shortcut="B" active={editor.isActive('bold')} click={() => editor.chain().focus().toggleBold().run()} icon={<GoogleIcon name="format_bold" size={17} />} />
                    <Tool label={t('Italic')} shortcut="I" active={editor.isActive('italic')} click={() => editor.chain().focus().toggleItalic().run()} icon={<GoogleIcon name="format_italic" size={17} />} />
                    <Tool label={t('Underline')} shortcut="U" active={editor.isActive('underline')} click={() => editor.chain().focus().toggleUnderline().run()} icon={<GoogleIcon name="format_underlined" size={17} />} />
                    <Tool label={t('Strikethrough')} active={editor.isActive('strike')} click={() => editor.chain().focus().toggleStrike().run()} icon={<GoogleIcon name="strikethrough_s" size={17} />} />
                    <Tool label={t('Inline code')} active={editor.isActive('code')} click={() => editor.chain().focus().toggleCode().run()} icon={<GoogleIcon name="code" size={17} />} />
                    <Tool label={t('Link')} shortcut="K" active={editor.isActive('link')} click={openLinkDialog} icon={<GoogleIcon name="link" size={17} />} />
                    <span className="separator" />
                    <BubbleDropdown
                      label={
                        <span className="bubble-color-a" style={{ color: editor.getAttributes('textStyle').color, background: editor.getAttributes('highlight').color }}>
                          A
                        </span>
                      }
                      title={t('Colour')}
                    >
                      {() => <ColorPanel editor={editor} />}
                    </BubbleDropdown>
                    <BubbleDropdown label={<span className="bubble-dd-text">Aa</span>} title={t('Font, size and alignment')}>
                      {() => (
                        <div className="fmt-panel">
                          <div className="fmt-label">{t('Font')}</div>
                          <InlineFontChips editor={editor} />
                          <div className="fmt-label">{t('Size')}</div>
                          <SizeButtons editor={editor} />
                          <div className="fmt-label">{t('Alignment')}</div>
                          <AlignButtons editor={editor} />
                          <div className="fmt-label">{t('More')}</div>
                          <MoreButtons editor={editor} />
                        </div>
                      )}
                    </BubbleDropdown>
                  </BubbleMenu>

                  {/* Inside a table → row/column tools */}
                  <BubbleMenu
                    editor={editor}
                    pluginKey="tableBubble"
                    className="bubble table-bubble"
                    shouldShow={({ state }) => state.selection.empty && editor.isActive('table')}
                    tippyOptions={{ placement: 'top-start' }}
                  >
                    <Tool label={t('Add row below')} click={() => editor.chain().focus().addRowAfter().run()} icon={<GoogleIcon name="table_rows" size={17} />} />
                    <Tool label={t('Add column right')} click={() => editor.chain().focus().addColumnAfter().run()} icon={<GoogleIcon name="view_column" size={17} />} />
                    <Tool label={t('Delete row')} click={() => editor.chain().focus().deleteRow().run()} icon={<GoogleIcon name="delete" size={17} />} />
                    <Tool label={t('Delete column')} click={() => editor.chain().focus().deleteColumn().run()} icon={<GoogleIcon name="delete" size={17} />} />
                    <span className="separator" />
                    <Tool label={t('Delete table')} click={() => editor.chain().focus().deleteTable().run()} icon={<GoogleIcon name="close" size={17} />} />
                  </BubbleMenu>

                  <SlashMenu editor={editor} onPickImage={() => imageFileRef.current?.click()} />
                  <BlockHandle editor={editor} />
                </>
              )}

              <EditorContent editor={editor} />
              <div className="editor-tail" aria-hidden="true" />

              <footer className="document-stats">
                <span>{t('{n} words', { n: words })}</span>
                <span>{t('{n} characters', { n: chars })}</span>
                {words > 0 && <span>{t('~{n} min read', { n: Math.ceil(words / 220) })}</span>}
              </footer>
            </article>
          ) : (
            <div className="empty">
              <h2>{t('No documents found')}</h2>
              <button className="button primary" onClick={() => create(undefined)}>
                {t('Create a document')}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* New Folder Modal */}
      {newFolderOpen && (
        <Modal title={t('Create folder')} onClose={() => setNewFolderOpen(false)}>
          <div className="modal-form-group">
            <label className="modal-label">{t('Folder name')}</label>
            <input
              className="modal-input"
              autoFocus
                            placeholder={t('e.g. Work, Notes, Research…')}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleCreateFolder()
              }}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="button" onClick={() => setNewFolderOpen(false)}>
              {t('Cancel')}
            </button>
            <button type="button" className="button primary" onClick={() => void handleCreateFolder()}>
              {t('Create folder')}
            </button>
          </div>
        </Modal>
      )}

      {/* Rename Folder Modal */}
      {folderToRename && (
        <Modal title={t('Rename folder')} onClose={() => setFolderToRename(null)}>
          <div className="modal-form-group">
            <label className="modal-label">{t('Folder name')}</label>
            <input
              className="modal-input"
              autoFocus
              value={renameFolderTitle}
              onChange={e => setRenameFolderTitle(e.target.value)}
              onFocus={e => e.target.select()}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void handleRenameFolder()
                }
                if (e.key === 'Escape') setFolderToRename(null)
              }}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="button" onClick={() => setFolderToRename(null)}>
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!renameFolderTitle.trim()}
              onClick={() => void handleRenameFolder()}
            >
              {t('Save')}
            </button>
          </div>
        </Modal>
      )}

      {/* Safe Delete Folder Modal */}
      {folderToDelete && (
        <Modal title={t('Delete folder')} onClose={() => setFolderToDelete(null)}>
          <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--text)' }}>
            {rich(t('Are you sure you want to delete folder **“{title}”**?', { title: folderToDelete.title }))}
          </p>

          {docs.filter(d => d.folderId === folderToDelete.id).length > 0 && (
            <div className="delete-options-list">
              <label className={`delete-option-card ${!deleteWithDocs ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="delete-folder-choice"
                  checked={!deleteWithDocs}
                  onChange={() => setDeleteWithDocs(false)}
                />
                <div className="delete-option-info">
                  <strong>{t('Delete folder only')}</strong>
                  <small>{t('Keep its {n} pages; they move to Pages.', { n: docs.filter(d => d.folderId === folderToDelete.id).length })}</small>
                </div>
              </label>

              <label className={`delete-option-card ${deleteWithDocs ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="delete-folder-choice"
                  checked={deleteWithDocs}
                  onChange={() => setDeleteWithDocs(true)}
                />
                <div className="delete-option-info">
                  <strong style={{ color: 'var(--danger)' }}>{t('Delete folder and notes')}</strong>
                  <small>{t('Move the folder’s {n} pages to Trash (restorable for {days} days).', { n: docs.filter(d => d.folderId === folderToDelete.id).length, days: TRASH_RETENTION_DAYS })}</small>
                </div>
              </label>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="button" onClick={() => setFolderToDelete(null)}>
              {t('Cancel')}
            </button>
            <button type="button" className="button danger" onClick={() => void handleSafeDeleteFolder()}>
              {t('Delete')}
            </button>
          </div>
        </Modal>
      )}

      {/* Link Dialog Modal */}
      {linkOpen && (
        <Modal title={t(editor?.isActive('link') ? 'Edit link' : 'Insert link')} onClose={() => setLinkOpen(false)}>
          <input
            className="input"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            aria-label={t('Link address')}
            data-autofocus
            onKeyDown={e => {
              if (e.key === 'Enter') applyLink()
            }}
          />
          <div className="modal-footer">
            {editor?.isActive('link') && (
              <button type="button" className="button danger" onClick={removeLink}>
                <GoogleIcon name="link_off" size={16} /> {t('Remove')}
              </button>
            )}
            <button type="button" className="button" onClick={() => setLinkOpen(false)}>
              {t('Cancel')}
            </button>
            <button type="button" className="button primary" onClick={applyLink}>
              {t('Save link')}
            </button>
          </div>
        </Modal>
      )}

      {/* Move Document Modal */}
      {movingDocId && (
        <Modal title={t('Move to folder')} onClose={() => setMovingDocId(null)}>
          <div className="move-modal-list">
            <button
              className="button move-item"
              onClick={() => {
                void moveToFolder(movingDocId)
                setMovingDocId(null)
              }}
            >
              <GoogleIcon name="description" size={18} /> {t('Pages (no folder)')}
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                className="button move-item"
                onClick={() => {
                  void moveToFolder(movingDocId, f.id)
                  setMovingDocId(null)
                }}
              >
                <GoogleIcon name="folder" size={18} /> {f.title}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {trashOpen && (
        <TrashDialog
          items={trash}
          titleOf={titleOf}
          onRestore={d => void restore(d)}
          onDeleteForever={d => void deleteForever([d.id])}
          onEmpty={() => void deleteForever(trash.map(d => d.id))}
          onClose={() => setTrashOpen(false)}
        />
      )}

      {quickFindOpen && (
        <QuickFindPalette
          docs={docs}
          folders={folders}
          titleOf={titleOf}
          textOf={textOf}
          onOpen={id => {
            selectDocument(id)
            if (focus) return
            const doc = docs.find(d => d.id === id)
            if (doc?.folderId) setExpandedFolders(prev => new Set(prev).add(doc.folderId!))
          }}
          onCreate={title => void create(undefined, title)}
          onClose={() => setQuickFindOpen(false)}
        />
      )}

      {/* Notification Toast */}
      {notice && (
        <div className={`toast ${notice.error ? 'error' : ''}`} role="status">
          <span>{notice.text}</span>
          <button className="icon-button" onClick={() => setNotice(null)} aria-label={t('Dismiss notification')}>
            <GoogleIcon name="close" size={16} />
          </button>
          {notice.action && (
            <button
              className="button"
              onClick={() => {
                notice.action?.run()
                setNotice(null)
              }}
            >
              {notice.action.label}
            </button>
          )}
          {notice.offerExport && (
            <button className="button" onClick={() => void backup()}>
              {t('Export backup now')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Tool({
  label,
  shortcut,
  icon,
  click,
  active = false,
}: {
  label: string
  shortcut?: string
  icon: React.ReactNode
  click: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${mod()}${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      className={`tool ${active ? 'active' : ''}`}
      onClick={click}
    >
      {icon}
    </button>
  )
}

