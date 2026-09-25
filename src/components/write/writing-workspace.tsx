'use client'

import { BubbleMenu, EditorContent, generateJSON, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { FontSize } from './font-size'
import FontFamily from '@tiptap/extension-font-family'
import { fontFamily } from './fonts'
import { InlineFontChips, PageFontButton } from './font-controls'
import { AlignButtons, BubbleDropdown, ColorPanel, currentBlockLabel, MoreButtons, SizeButtons, TurnInto } from './format-controls'
import {
  Bold, Code, Columns2, Copy, Download, Focus, Italic, Link2, Minimize2, PanelLeftClose,
  PanelLeftOpen, Plus, Printer, Rows, Search, Strikethrough, Trash2, Underline as UnderlineIcon, Unlink, Upload, X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db, exportBackup, importBackup, isQuotaError, parseBackup } from '@/lib/db'
import { useAutosave } from '@/lib/use-autosave'
import { markdownToHtml, toMarkdown } from '@/lib/markdown'
import { imageFileToDataUrl, isImageFile } from '@/lib/images'
import type { EditorView } from '@tiptap/pm/view'
import { ImageNode } from './image-node'
import { SlashMenu } from './slash-menu'
import { Dictation } from './dictation'
import { CaptureScreenButton } from '../screen-capture'
import { KeyboardBar } from './keyboard-bar'
import { NodeSelection } from '@tiptap/pm/state'
import { Modal } from '../modal'
import { SaveIndicator } from '../save-indicator'
import { MenuButton } from '../menu-button'
import { EMPTY_CONTENT, newDocument, type LocalDocument, type SaveState } from '@/lib/models'
import { timeAgo } from '@/lib/time'
import { detectLang, getLang, rich, translate, useI18n } from '@/lib/i18n'
import './write.css'

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

const extensions = [
  StarterKit,
  Underline,
  Link.configure({ openOnClick: false }),
  // Notion-style hints: on an empty page, and on whichever empty line you're on.
  Placeholder.configure({
    showOnlyCurrent: true,
    placeholder: ({ editor, node }) =>
      node.type.name === 'heading'
        ? translate('Heading {n}', { n: node.attrs.level }, getLang())
        : editor.isEmpty
          ? translate("Start writing, or type '/' for blocks", undefined, getLang())
          : translate("Type '/' for blocks", undefined, getLang()),
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  ImageNode,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  FontSize,
  FontFamily,
  Subscript,
  Superscript,
]

// Shortcut hint prefix; only called in client-rendered UI.
const mod = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+')

// Below this width the document list is an overlay, not a column.
const isNarrow = () => window.matchMedia('(max-width: 700px)').matches

export default function WritingWorkspace() {
  const { t } = useI18n()
  // Untitled documents keep the default name in whatever language is shown.
  const titleOf = (title: string) => (!title || title === 'Untitled document' || title === 'Tài liệu chưa đặt tên' ? t('Untitled document') : title)
  const [docs, setDocs] = useState<LocalDocument[]>([])
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState<SaveState>('idle')
  const [sidebar, setSidebar] = useState(true)
  const [focus, setFocus] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean; offerExport?: boolean } | null>(null)


  // Link dialog state
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // Delete modal state
  const [docToDelete, setDocToDelete] = useState<LocalDocument | null>(null)

  // Bumped when the active document is replaced from outside the editor (e.g. backup import).
  const [contentVersion, setContentVersion] = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)
  const imageFileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const focusTitleNext = useRef(false)

  // Confirmations fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (!notice || notice.error) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])
  const active = docs.find(d => d.id === activeId)

  const autosave = useAutosave<Partial<Pick<LocalDocument, 'title' | 'content' | 'font'>>>({
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
    const all = await db.documents.orderBy('updatedAt').reverse().toArray()
    setDocs(all)
    const wanted = id || localStorage.getItem('my-space:last-document') || all[0]?.id
    if (wanted) {
      setActiveId(all.some(d => d.id === wanted) ? wanted : all[0]?.id)
    }
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
        let all = await db.documents.toArray()
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
                type: 'paragraph',
                content: [{ type: 'text', text: tt('Everything you write stays in this browser. Type “/” for blocks, or select text to format it.') }],
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
      extensions,
      content: active?.content ?? EMPTY_CONTENT,
      editorProps: {
        attributes: { class: 'prose-editor', 'aria-label': translate('Document content', undefined, getLang()) },
        transformPastedHTML: html => html.replace(/ style="[^"]*"/gi, ''),
        // Paste or drop images straight into the page.
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile)
          if (!files.length) return false
          event.preventDefault()
          void insertImages(view, files)
          return true
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
    // One editor per document: it is created with that document's content and
    // its own undo history. Never push state back into a live editor on every
    // keystroke — that resets the cursor and wipes undo.
    [activeId, contentVersion]
  )

  useEffect(() => {
    if (activeId) localStorage.setItem('my-space:last-document', activeId)
  }, [activeId])

  // Shrinking to phone width turns the list into an overlay; close it so it
  // doesn't suddenly cover the editor.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)')
    const onChange = () => query.matches && setSidebar(false)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

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

  // Keyboard shortcuts (Escape leaves focus mode, Cmd/Ctrl+K inserts a link).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focus) setFocus(false)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openLinkDialog()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focus, openLinkDialog])

  const create = async () => {
    await autosave.flush()
    const d = newDocument(t('Untitled document'))
    await db.documents.add(d)
    setQuery('')
    if (isNarrow()) setSidebar(false)
    focusTitleNext.current = true
    await refresh(d.id)
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

  const confirmDelete = async () => {
    if (!docToDelete) return
    const target = docToDelete
    setDocToDelete(null)
    await db.documents.delete(target.id)
    let remaining = docs.filter(x => x.id !== target.id)
    if (!remaining.length) {
      const fresh = newDocument()
      await db.documents.add(fresh)
      remaining = [fresh]
    }
    await refresh(remaining[0].id)
    setNotice({ text: t('Deleted "{title}"', { title: titleOf(target.title) }) })
  }

  const backup = async () => {
    // Documents come from memory, not IndexedDB: after a failed save the
    // on-screen text is newer than what is stored.
    const stored = await exportBackup().catch(() => null)
    const data = { format: 'my-space-backup' as const, version: 1 as const, exportedAt: new Date().toISOString(), documents: docs, boards: stored?.boards ?? [] }
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
          d.content = generateJSON(markdownToHtml(raw), extensions)
        } else if (ext === 'html' || ext === 'htm') {
          // Parsed against the editor schema: scripts, styles and unknown tags are dropped.
          d.content = generateJSON(raw, extensions)
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
        // Nothing selected: insert the address itself as a link instead of silently doing nothing.
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

  // First words of the body, so documents can be told apart without opening them.
  const preview = (d: LocalDocument) => plainText(d.content).replace(/\s+/g, ' ').trim().slice(0, 90)
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? docs.filter(d => d.title.toLowerCase().includes(needle) || plainText(d.content).toLowerCase().includes(needle))
    : docs
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
      {/* Floating Exit Focus Mode Button */}
      {focus && (
        <button
          className="exit-focus-btn"
          onClick={() => setFocus(false)}
          title={t('Exit focus mode (Esc)')}
          aria-label={t('Exit focus mode')}
        >
          <Minimize2 size={16} />
          <span>{t('Exit Focus')}</span>
          <kbd className="kbd-hint">Esc</kbd>
        </button>
      )}

      {/* Sidebar / Document Library */}
      <aside className="documents" aria-label={t('Documents')}>
        <div className="docs-head">
          <h1>{t('Documents')}</h1>
          <button type="button" className="new-btn" onClick={create} aria-label={t('New document')}>
            <Plus size={15} /> {t('New')}
          </button>
        </div>

        <label className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('Search titles and text…')}
            aria-label={t('Search documents')}
          />
        </label>

        <div className="document-list">
          {!filtered.length && needle && <p className="list-empty">{t('Nothing matches “{query}”.', { query: query.trim() })}</p>}
          {filtered.map(d => {
            const isActive = d.id === activeId
            return (
              <div className={`document-row ${isActive ? 'active' : ''}`} key={d.id}>
                <button
                  type="button"
                  className="doc-select-btn"
                  onClick={() => selectDocument(d.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="doc-title">{titleOf(d.title)}</span>
                  <span className="doc-meta">
                    {timeAgo(d.updatedAt)}
                    {preview(d) && <> · {preview(d)}</>}
                  </span>
                </button>
                <div className="doc-actions">
                  <button
                    type="button"
                    className="doc-action-btn"
                    title={t('Duplicate document')}
                    aria-label={t('Duplicate {title}', { title: titleOf(d.title) })}
                    onClick={e => {
                      e.stopPropagation()
                      void duplicate(d)
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn delete-btn"
                    title={t('Delete document')}
                    aria-label={t('Delete {title}', { title: titleOf(d.title) })}
                    onClick={e => {
                      e.stopPropagation()
                      setDocToDelete(d)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="docs-footer">
          <button className="button" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> {t('Import')}
          </button>
          <button className="button" onClick={() => void backup()}>
            <Download size={15} /> {t('Backup')}
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".json,.md,.markdown,.txt,.html,.htm"
            onChange={e => void importFile(e.target.files?.[0])}
          />
          <p>{t('Stored only in this browser. Back up now and then.')}</p>
        </div>
      </aside>

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
            {sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </button>

          <SaveIndicator state={save} />

          <div className="header-actions">
            <MenuButton
              label={t('Export')}
              icon={<Download size={15} />}
              items={[
                { label: 'Markdown', hint: '.md', onSelect: () => exportActive('md') },
                { label: t('Plain text'), hint: '.txt', onSelect: () => exportActive('txt') },
                { label: t('Web page'), hint: '.html', onSelect: () => exportActive('html') },
                'separator',
                { label: t('Print or save as PDF'), icon: <Printer size={15} />, onSelect: () => window.print() },
              ]}
            />

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

            <button
              className="icon-button"
              onClick={() => setFocus(true)}
              aria-label={t('Focus mode')}
              title={t('Focus mode (full screen writing)')}
            >
              <Focus size={18} />
            </button>
          </div>
        </header>

        {/* Formatting Toolbar */}
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
        <div className="editor-scroll">
          {active ? (
            <article
              className={`page ${fontFamily(active.font) ? 'has-font' : ''}`}
              style={{ '--doc-font': fontFamily(active.font) ?? undefined } as React.CSSProperties}
            >
              <input
                ref={titleRef}
                className="title-input"
                value={active.title}
                onChange={e => updateTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && editor) {
                    e.preventDefault()
                    // focus('start') sets the caret now but moves DOM focus in a later
                    // animation frame; focus the view synchronously so the next
                    // keystroke can't land in the title.
                    editor.commands.focus('start')
                    editor.view.focus()
                  }
                }}
                aria-label={t('Document title')}
                placeholder={t('Untitled document')}
              />

              {editor && (
                <>
                  {/* Select text → formatting, like Notion. */}
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
                    <Tool label={t('Bold')} shortcut="B" active={editor.isActive('bold')} click={() => editor.chain().focus().toggleBold().run()} icon={<Bold />} />
                    <Tool label={t('Italic')} shortcut="I" active={editor.isActive('italic')} click={() => editor.chain().focus().toggleItalic().run()} icon={<Italic />} />
                    <Tool label={t('Underline')} shortcut="U" active={editor.isActive('underline')} click={() => editor.chain().focus().toggleUnderline().run()} icon={<UnderlineIcon />} />
                    <Tool label={t('Strikethrough')} active={editor.isActive('strike')} click={() => editor.chain().focus().toggleStrike().run()} icon={<Strikethrough />} />
                    <Tool label={t('Inline code')} active={editor.isActive('code')} click={() => editor.chain().focus().toggleCode().run()} icon={<Code />} />
                    <Tool label={t('Link')} shortcut="K" active={editor.isActive('link')} click={openLinkDialog} icon={<Link2 />} />
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

                  {/* Inside a table → row/column tools (the only place they live on desktop). */}
                  <BubbleMenu
                    editor={editor}
                    pluginKey="tableBubble"
                    className="bubble table-bubble"
                    shouldShow={({ state }) => state.selection.empty && editor.isActive('table')}
                    tippyOptions={{ placement: 'top-start' }}
                  >
                    <Tool label={t('Add row below')} click={() => editor.chain().focus().addRowAfter().run()} icon={<Rows />} />
                    <Tool label={t('Add column right')} click={() => editor.chain().focus().addColumnAfter().run()} icon={<Plus />} />
                    <Tool label={t('Delete row')} click={() => editor.chain().focus().deleteRow().run()} icon={<Trash2 />} />
                    <Tool label={t('Delete column')} click={() => editor.chain().focus().deleteColumn().run()} icon={<Columns2 />} />
                    <span className="separator" />
                    <Tool label={t('Delete table')} click={() => editor.chain().focus().deleteTable().run()} icon={<X />} />
                  </BubbleMenu>

                  <SlashMenu editor={editor} onPickImage={() => imageFileRef.current?.click()} />
                </>
              )}

              <EditorContent editor={editor} />

              <footer className="document-stats">
                <span>{t('{n} words', { n: words })}</span>
                <span>{t('{n} characters', { n: chars })}</span>
                {words > 0 && <span>{t('~{n} min read', { n: Math.ceil(words / 220) })}</span>}
              </footer>
            </article>
          ) : (
            <div className="empty">
              <h2>{t('No documents found')}</h2>
              <button className="button primary" onClick={create}>
                {t('Create a document')}
              </button>
            </div>
          )}
        </div>
      </section>

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
                  <Unlink size={15} /> {t('Remove')}
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

      {/* Delete Document Confirmation Modal */}
      {docToDelete && (
        <Modal title={t('Delete document')} onClose={() => setDocToDelete(null)}>
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              {rich(t('Are you sure you want to delete **“{title}”**? This action cannot be undone.', { title: titleOf(docToDelete.title) }))}
            </p>
            <div className="modal-footer">
              {/* Cancel takes focus: Enter must never delete by accident. */}
              <button type="button" className="button" onClick={() => setDocToDelete(null)} data-autofocus>
                {t('Cancel')}
              </button>
              <button type="button" className="button danger" onClick={() => void confirmDelete()}>
                {t('Delete')}
              </button>
            </div>
        </Modal>
      )}

      {/* Notification Toast */}
      {notice && (
        <div className={`toast ${notice.error ? 'error' : ''}`} role="status">
          <span>{notice.text}</span>
          <button className="icon-button" onClick={() => setNotice(null)} aria-label={t('Dismiss notification')}>
            <X size={16} />
          </button>
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
