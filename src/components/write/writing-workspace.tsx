'use client'

import { BubbleMenu, EditorContent, generateHTML, generateJSON, useEditor } from '@tiptap/react'
import { fontFamily } from './fonts'
import { InlineFontChips, PageFontButton } from './font-controls'
import { AlignButtons, BubbleDropdown, ColorPanel, currentBlockLabel, MoreButtons, SizeButtons, TurnInto } from './format-controls'
import { GoogleIcon } from '../google-icon'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db, exportBackup, importBackup, isQuotaError, parseBackup } from '@/lib/db'
import { useAutosave } from '@/lib/use-autosave'
import { looksLikeMarkdown, markdownToHtml, normalizePastedMarkdown, toMarkdown } from '@/lib/markdown'
import { imageFileToDataUrl, isImageFile } from '@/lib/images'
import type { EditorView } from '@tiptap/pm/view'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { writeExtensions } from './editor-extensions'
import { SlashMenu } from './slash-menu'
import { Dictation } from './dictation'
import { MeetingRecorderBar, MeetingSetupDialog, downloadRecording, useDocRecordings, useMeetingSnapshot } from './meeting-recorder'
import { appendToStoredDoc, meetingSession } from '@/lib/meeting-session'
import { deleteRecordingsForDocs } from '@/lib/meeting-recording-store'
import { formatElapsed } from '@/lib/transcript-format'
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
import { PageBreadcrumb } from './page-breadcrumb'
import { MovePageDialog } from './move-page-dialog'
import { insertPageLink, withLivePageLinkTitles } from './page-link-node'
import { PageDirectoryContext, type LinkedPage } from './page-link-view'
import { ancestorsOf, buildPageTree, rootOf, trashGroupOf, trashRoots } from '@/lib/page-tree'
import { moveToFolderPatches, nestPatches, pagesInFolder, restorePatches, trashPatches, type DocPatch } from '@/lib/page-tree-operations'
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
  const { t, lang } = useI18n()
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
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  // "Link to page" picker; `at` is where a typed "@" opened it (removed when a page is picked).
  const [linkPicker, setLinkPicker] = useState<{ at?: number } | null>(null)
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
  const tree = useMemo(() => buildPageTree(docs), [docs])
  const ancestors = useMemo(() => (active ? ancestorsOf(tree, active.id) : []), [tree, active])
  // A sub-page lives wherever its top-level page is filed.
  const activeRoot = active ? rootOf(tree, active.id) : undefined
  const activeFolder = activeRoot?.folderId ? folders.find(f => f.id === activeRoot.folderId) : undefined
  const trashEntries = useMemo(() => trashRoots(trash), [trash])

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
        handleTextInput: (view, from, _to, text) => {
          // "@" at the start of a word opens the page picker, like Notion's page mention.
          if (text !== '@') return false
          const $from = view.state.doc.resolve(from)
          if ($from.parent.type.name === 'codeBlock') return false
          const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, '\ufffc')
          if (before && !/\s/.test(before)) return false
          setTimeout(() => setLinkPicker({ at: from }), 0)
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

  // ---- Meeting recording: live transcript lines go into the open editor when it shows the meeting page.
  const meeting = useMeetingSnapshot()
  const [meetingSetupOpen, setMeetingSetupOpen] = useState(false)
  const [recordingsVersion, setRecordingsVersion] = useState(0)
  const activeRecordings = useDocRecordings(active?.id, recordingsVersion)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const lastMeeting = useRef({ state: meeting.state, lines: 0, elapsedMs: 0, docId: null as string | null })

  useEffect(() => {
    meetingSession.setSink(async (docId, blocks) => {
      const ed = editorRef.current
      if (ed && !ed.isDestroyed && activeIdRef.current === docId) {
        // Keep the trailing empty line (where the user may be typing notes) below the transcript.
        const last = ed.state.doc.lastChild
        const at = last && last.type.name === 'paragraph' && !last.content.size ? ed.state.doc.content.size - last.nodeSize : ed.state.doc.content.size
        ed.commands.insertContentAt(at, blocks, { updateSelection: false })
        return
      }
      await appendToStoredDoc(docId, blocks)
      const fresh = await db.documents.get(docId)
      if (fresh) setDocs(v => v.map(d => (d.id === docId ? { ...d, content: fresh.content, updatedAt: fresh.updatedAt } : d)))
    })
    return () => meetingSession.setSink(null)
  }, [])

  // Errors on start, and a summary once a meeting is saved.
  useEffect(() => {
    const prev = lastMeeting.current
    if (meeting.error && prev.state === 'starting') setNotice({ text: t(meeting.error), error: true })
    if (prev.state === 'stopping' && meeting.state === 'idle' && prev.docId) {
      setRecordingsVersion(v => v + 1)
      setNotice({ text: t('Meeting saved: {n} lines, {time}.', { n: prev.lines, time: formatElapsed(prev.elapsedMs) }) })
    }
    lastMeeting.current = { state: meeting.state, lines: meeting.lines, elapsedMs: meeting.elapsedMs, docId: meeting.docId }
  }, [meeting, t])


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

  /** Expands the sidebar down to a page: its folder and every parent page. */
  const revealPage = (id: string) => {
    const chain = ancestorsOf(tree, id)
    if (chain.length) setExpandedPages(prev => new Set([...prev, ...chain.map(a => a.id)]))
    const folderId = (chain[0] ?? tree.byId.get(id))?.folderId
    if (folderId) setExpandedFolders(prev => new Set(prev).add(folderId))
  }

  /** Opens a page from a link, the breadcrumb or Quick Find, and shows it in the sidebar. */
  const openPage = (id: string) => {
    selectDocument(id)
    revealPage(id)
  }

  const applyPatches = async (patches: DocPatch[], touchedId?: string) => {
    const updatedAt = new Date().toISOString()
    await db.transaction('rw', db.documents, async () => {
      for (const { id, patch } of patches) await db.documents.update(id, id === touchedId ? { ...patch, updatedAt } : patch)
    })
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

  /**
   * New page: top-level (optionally in a folder) or, with `parentId`, a
   * sub-page filed with its parent. `preset` supplies a page whose id is
   * already linked from the editor. `open: false` stays on the current page.
   */
  const create = async ({ folderId, title, parentId, preset, open = true }: { folderId?: string; title?: string; parentId?: string; preset?: LocalDocument; open?: boolean } = {}) => {
    await autosave.flush()
    const parent = parentId ? tree.byId.get(parentId) : undefined
    const base = preset ?? newDocument(title || t('Untitled document'))
    const d: LocalDocument = parent ? { ...base, parentId: parent.id, folderId: rootOf(tree, parent.id)?.folderId } : { ...base, folderId }
    await db.documents.add(d)
    if (d.folderId) setExpandedFolders(prev => new Set(prev).add(d.folderId!))
    if (parent) {
      setExpandedPages(prev => new Set(prev).add(parent.id))
      revealPage(parent.id)
    }
    if (!open) return refresh(activeId)
    if (isNarrow()) setSidebar(false)
    focusTitleNext.current = !title
    await refresh(d.id)
  }

  const startMeeting = (settings: { lang: string; mic: boolean; meeting: boolean; saveAudio: boolean }) => {
    setMeetingSetupOpen(false)
    const when = new Date().toLocaleString(lang === 'vi' ? 'vi-VN' : undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    void meetingSession.start({
      ...settings,
      createDoc: async () => {
        const d = newDocument(t('Meeting {when}', { when }), '🎙️')
        d.content = {
          type: 'doc',
          content: [
            {
              type: 'callout',
              attrs: { icon: '🎙️' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: t('Recorded {when}. Transcribed live by the browser; edit freely.', { when }) }] }],
            },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: t('Transcript') }] },
          ],
        }
        await create({ preset: d, title: d.title })
        return d.id
      },
    })
  }

  /** Puts a link block to `pageId` at the caret (replacing a typed "@" that opened the picker). */
  const insertLinkTo = (pageId: string, title: string) => {
    if (!editor) return
    const at = linkPicker?.at
    if (at !== undefined && at + 1 <= editor.state.doc.content.size && editor.state.doc.textBetween(at, at + 1) === '@') {
      editor.view.dispatch(editor.state.tr.delete(at, at + 1))
    }
    const tr = insertPageLink(editor.state, { pageId, title })
    if (tr) editor.view.dispatch(tr)
    editor.commands.focus()
  }

  /** "/page": a new sub-page, linked from where the caret is, then opened. */
  const addSubpageBlock = async () => {
    if (!active) return
    const d = newDocument(t('Untitled document'))
    insertLinkTo(d.id, '')
    await create({ parentId: active.id, preset: d })
  }

  const nestPage = async (docId: string, parentId: string) => {
    const patches = nestPatches(tree, docId, parentId)
    if (!patches) return
    await applyPatches(patches, docId)
    setExpandedPages(prev => new Set(prev).add(parentId))
    revealPage(parentId)
    await refresh(activeId)
    const doc = tree.byId.get(docId)
    const parent = tree.byId.get(parentId)
    if (doc && parent) setNotice({ text: t('Moved "{title}" into "{parent}"', { title: titleOf(doc.title), parent: titleOf(parent.title) }) })
  }

  const patchActive = (patch: Partial<Pick<LocalDocument, 'icon' | 'fullWidth'>>) => {
    if (!active) return
    setDocs(v => v.map(d => (d.id === active.id ? { ...d, ...patch } : d)))
    autosave.queue(active.id, patch)
  }

  const moveToFolder = async (docId: string, folderId?: string) => {
    await applyPatches(moveToFolderPatches(tree, docId, folderId), docId)
    if (folderId) setExpandedFolders(prev => new Set(prev).add(folderId))
    await refresh(activeId)
    const doc = docs.find(d => d.id === docId)
    const folder = folders.find(f => f.id === folderId)
    if (doc) setNotice({ text: t('Moved "{title}" to "{folder}"', { title: titleOf(doc.title), folder: folder?.title ?? t('Pages') }) })
  }

  /** Soft delete: the page and its sub-pages go to Trash and can be restored (or undone right away). */
  const moveToTrash = async (d: LocalDocument) => {
    await autosave.flush()
    const patches = trashPatches(tree, d.id, new Date().toISOString())
    await applyPatches(patches)
    const gone = new Set(patches.map(p => p.id))
    const next = gone.has(activeId) ? (tree.parent.get(d.id) ?? docs.find(x => !gone.has(x.id))?.id) : activeId
    await refresh(next)
    const n = patches.length - 1
    setNotice({
      text: n
        ? t(n === 1 ? 'Moved "{title}" and {n} sub-page to Trash' : 'Moved "{title}" and {n} sub-pages to Trash', { title: titleOf(d.title), n })
        : t('Moved "{title}" to Trash', { title: titleOf(d.title) }),
      action: { label: t('Undo'), run: () => void restore(d, true) },
    })
  }

  const restore = async (d: LocalDocument, open = false) => {
    // Read fresh: an Undo holds the page as it was before it went to Trash.
    const all = await db.documents.toArray()
    const doc = all.find(x => x.id === d.id)
    if (!doc?.deletedAt) return
    const folderIds = new Set((await db.folders.toArray()).map(f => f.id))
    await applyPatches(restorePatches(all, doc, id => folderIds.has(id)))
    if (doc.parentId) setExpandedPages(prev => new Set(prev).add(doc.parentId!))
    await refresh(open ? d.id : activeId || d.id)
    if (!open) setNotice({ text: t('Restored "{title}"', { title: titleOf(d.title) }) })
    else setNotice(null)
  }

  /** Deleting a Trash entry forever also deletes the sub-pages trashed with it. */
  const deleteEntryForever = (d: LocalDocument) => deleteForever(trashGroupOf(trash, d).map(x => x.id))

  const deleteForever = async (ids: string[]) => {
    await db.documents.bulkDelete(ids)
    await deleteRecordingsForDocs(ids).catch(() => undefined)
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
    const docsInFolder = pagesInFolder(tree, f.id)

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
  const parentTitleOf = (d: LocalDocument) => {
    const parent = tree.byId.get(tree.parent.get(d.id) ?? '')
    return parent ? titleOf(parent.title) : undefined
  }
  // Page-link blocks read titles and icons from here, so a rename shows up in every link at once.
  const pageDirectory = {
    lookup: (id: string): LinkedPage => {
      const d = tree.byId.get(id)
      if (d) return { title: titleOf(d.title), icon: d.icon, status: 'live' }
      return { title: '', status: trash.some(x => x.id === id) ? 'trash' : 'missing' }
    },
    open: openPage,
  }
  const words = plainText(active?.content).trim().split(/\s+/).filter(Boolean).length
  const chars = plainText(active?.content).length

  const exportActive = (format: string) => {
    if (!active || !editor || !format) return
    // Exports carry each linked page's current title, not the one it had when linked.
    const json = withLivePageLinkTitles(editor.getJSON(), id => (tree.byId.has(id) ? titleOf(tree.byId.get(id)!.title) : undefined))
    const safe = titleOf(active.title).replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'document'
    if (format === 'html') {
      const font = fontFamily(active.font)
      download(`${safe}.html`, `<!doctype html><meta charset="utf-8"><title>${safe}</title><article${font ? ` style="font-family: ${font.replace(/"/g, "'")}"` : ''}>${generateHTML(json, writeExtensions)}</article>`, 'text/html')
    }
    if (format === 'txt') {
      download(`${safe}.txt`, editor.getText(), 'text/plain')
    }
    if (format === 'md') {
      download(`${safe}.md`, toMarkdown(json), 'text/markdown')
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
        tree={tree}
        folders={folders}
        activeId={activeId}
        trashCount={trashEntries.length}
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
        expandedPages={expandedPages}
        onTogglePage={id =>
          setExpandedPages(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
        onSelect={selectDocument}
        onCreate={folderId => void create({ folderId })}
        onCreateSubpage={parentId => void create({ parentId })}
        onNest={(id, parentId) => void nestPage(id, parentId)}
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
        onPickDestination={setMovingDocId}
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
            <PageBreadcrumb page={active} ancestors={ancestors} folder={activeFolder} titleOf={titleOf} onOpen={openPage} onMove={() => setMovingDocId(active.id)} />
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

            {meeting.state === 'idle' ? (
              <button type="button" className="icon-button" onClick={() => setMeetingSetupOpen(true)} title={t('Record a meeting')} aria-label={t('Record a meeting')}>
                <GoogleIcon name="graphic_eq" size={20} />
              </button>
            ) : (
              <button
                type="button"
                className="meeting-header-chip"
                onClick={() => meeting.docId && selectDocument(meeting.docId)}
                title={t('Open transcript')}
              >
                <span className="meeting-dot" aria-hidden="true" />
                {formatElapsed(meeting.elapsedMs)}
              </button>
            )}

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
                  { label: t('Move to'), icon: <GoogleIcon name="drive_file_move" size={16} />, onSelect: () => setMovingDocId(active.id) },
                  'separator',
                  { label: t('Export as Markdown'), hint: '.md', icon: <GoogleIcon name="download" size={16} />, onSelect: () => exportActive('md') },
                  { label: t('Export as plain text'), hint: '.txt', icon: <GoogleIcon name="download" size={16} />, onSelect: () => exportActive('txt') },
                  { label: t('Export as web page'), hint: '.html', icon: <GoogleIcon name="download" size={16} />, onSelect: () => exportActive('html') },
                  { label: t('Print or save as PDF'), icon: <GoogleIcon name="print" size={16} />, onSelect: () => window.print() },
                  ...activeRecordings.map(r => ({
                    label: t('Download meeting audio'),
                    hint: formatElapsed(r.durationMs),
                    icon: <GoogleIcon name="audio_file" size={16} />,
                    onSelect: () => void downloadRecording(r, titleOf(active.title)).catch(() => setNotice({ text: t('The audio file could not be read.'), error: true })),
                  })),
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

                  <SlashMenu editor={editor} onPickImage={() => imageFileRef.current?.click()} onAddSubpage={() => void addSubpageBlock()} onLinkPage={() => setLinkPicker({})} />
                  <BlockHandle editor={editor} />
                </>
              )}

              <PageDirectoryContext.Provider value={pageDirectory}>
                <EditorContent editor={editor} />
              </PageDirectoryContext.Provider>
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
              <button className="button primary" onClick={() => void create()}>
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

          {pagesInFolder(tree, folderToDelete.id).length > 0 && (
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
                  <small>{t('Keep its {n} pages; they move to Pages.', { n: pagesInFolder(tree, folderToDelete.id).length })}</small>
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
                  <small>{t('Move the folder’s {n} pages to Trash (restorable for {days} days).', { n: pagesInFolder(tree, folderToDelete.id).length, days: TRASH_RETENTION_DAYS })}</small>
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

      {movingDocId && (
        <MovePageDialog
          docId={movingDocId}
          tree={tree}
          folders={folders}
          titleOf={titleOf}
          onMoveToFolder={folderId => void moveToFolder(movingDocId, folderId)}
          onNest={parentId => void nestPage(movingDocId, parentId)}
          onClose={() => setMovingDocId(null)}
        />
      )}

      {meetingSetupOpen && <MeetingSetupDialog onStart={startMeeting} onClose={() => setMeetingSetupOpen(false)} />}
      <MeetingRecorderBar activeId={activeId} onOpenDoc={selectDocument} />

      {trashOpen && (
        <TrashDialog
          items={trashEntries}
          total={trash.length}
          subPageCount={d => trashGroupOf(trash, d).length - 1}
          titleOf={titleOf}
          onRestore={d => void restore(d)}
          onDeleteForever={d => void deleteEntryForever(d)}
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
          pathOf={parentTitleOf}
          onOpen={openPage}
          onCreate={title => void create({ title })}
          onClose={() => setQuickFindOpen(false)}
        />
      )}

      {linkPicker && active && (
        <QuickFindPalette
          docs={docs}
          folders={folders}
          titleOf={titleOf}
          textOf={textOf}
          pathOf={parentTitleOf}
          excludeId={active.id}
          placeholder="Link to a page…"
          createLabel="New sub-page “{title}”"
          onOpen={id => insertLinkTo(id, titleOf(tree.byId.get(id)?.title ?? ''))}
          onCreate={title => {
            const d = newDocument(title)
            insertLinkTo(d.id, title)
            void create({ parentId: active.id, preset: d, title, open: false })
          }}
          onClose={() => {
            setLinkPicker(null)
            editor?.commands.focus()
          }}
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

