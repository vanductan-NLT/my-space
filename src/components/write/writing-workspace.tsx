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
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Check, PanelLeftClose, PanelLeftOpen,
  Code, Copy, Download, Focus, Heading1, Heading2, Heading3,
  Italic, Link2, List, ListOrdered, Minimize2, Plus, Printer,
  Quote, Redo2, Rows, Search, Strikethrough, Table2, Trash2,
  Underline as UnderlineIcon, Undo2, Unlink, Upload, X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db, exportBackup, importBackup, isQuotaError, parseBackup } from '@/lib/db'
import { useAutosave } from '@/lib/use-autosave'
import { markdownToHtml, toMarkdown } from '@/lib/markdown'
import { Modal } from '../modal'
import { SaveIndicator } from '../save-indicator'
import { MenuButton } from '../menu-button'
import { EMPTY_CONTENT, newDocument, type LocalDocument, type SaveState } from '@/lib/models'
import { timeAgo } from '@/lib/time'
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
  Placeholder.configure({ placeholder: 'Start writing…' }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
]

// Shortcut hint prefix; only called in client-rendered UI.
const mod = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+')

// Below this width the document list is an overlay, not a column.
const isNarrow = () => window.matchMedia('(max-width: 700px)').matches

export default function WritingWorkspace() {
  const [docs, setDocs] = useState<LocalDocument[]>([])
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState<SaveState>('idle')
  const [sidebar, setSidebar] = useState(true)
  const [focus, setFocus] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean; offerExport?: boolean } | null>(null)

  // Find & Replace state
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [findStatus, setFindStatus] = useState('')

  // Link dialog state
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // Delete modal state
  const [docToDelete, setDocToDelete] = useState<LocalDocument | null>(null)

  // Bumped when the active document is replaced from outside the editor (e.g. backup import).
  const [contentVersion, setContentVersion] = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const focusTitleNext = useRef(false)

  // Confirmations fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (!notice || notice.error) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])
  const active = docs.find(d => d.id === activeId)

  const autosave = useAutosave<Partial<Pick<LocalDocument, 'title' | 'content'>>>({
    delay: 650,
    write: async (id, patch) => {
      const title = patch.title === undefined ? {} : { title: patch.title.trim() || 'Untitled document' }
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
      setNotice({ text: 'IndexedDB is unavailable. Work cannot be saved in this browser.', error: true })
      setLoading(false)
      return
    }

    void (async () => {
      try {
        let all = await db.documents.toArray()
        if (!all.length) {
          // Fixed id + put: seeding twice (StrictMode, two tabs) can't create duplicates.
          const first = { ...newDocument('Welcome to My Space'), id: 'welcome' }
          first.content = {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'A quiet place for clear thinking.' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Everything you write stays in this browser. Start typing, or format your text using the toolbar.' }],
              },
            ],
          }
          await db.documents.put(first)
          all = [first]
        }
        await refresh()
        setSave('saved')
      } catch {
        setNotice({ text: 'Local storage could not be opened. Your current work will remain on screen.', error: true })
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: active?.content ?? EMPTY_CONTENT,
      editorProps: {
        attributes: { class: 'prose-editor', 'aria-label': 'Document content' },
        transformPastedHTML: html => html.replace(/ style="[^"]*"/gi, ''),
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

  // Keyboard shortcuts (Escape, Cmd+F, Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focus) {
          setFocus(false)
        } else if (findOpen) {
          setFindOpen(false)
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFindOpen(v => !v)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openLinkDialog()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focus, findOpen, openLinkDialog])

  const create = async () => {
    await autosave.flush()
    const d = newDocument()
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
      title: `${d.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await db.documents.add(copy)
    await refresh(copy.id)
    setNotice({ text: `Duplicated "${copy.title}"` })
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
    setNotice({ text: `Deleted "${target.title}"` })
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
        const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
        const restored = result.added + result.updated
        const parts = [
          restored ? `Restored ${plural(restored, 'item')}.` : '',
          result.keptAsCopy
            ? `${plural(result.keptAsCopy, 'item')} had newer edits here, so the backup version was added as a “(from backup)” copy.`
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
        setNotice({ text: 'Document imported.' })
      }
    } catch (err) {
      setNotice({
        text: err instanceof SyntaxError || !(err instanceof Error)
          ? 'This file could not be read. Choose a My Space backup (.json) or a .md, .txt or .html file.'
          : err.message,
        error: true,
      })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Safe Find & Replace using ProseMirror transaction
  const countMatches = useCallback(() => {
    if (!editor || !findQuery) {
      setFindStatus('')
      return 0
    }
    const { doc } = editor.state
    let count = 0
    doc.descendants(node => {
      if (node.isText && node.text) {
        const textLower = node.text.toLowerCase()
        const queryLower = findQuery.toLowerCase()
        let idx = textLower.indexOf(queryLower)
        while (idx !== -1) {
          count++
          idx = textLower.indexOf(queryLower, idx + queryLower.length)
        }
      }
    })
    setFindStatus(count === 0 ? 'No matches' : `${count} match${count > 1 ? 'es' : ''}`)
    return count
  }, [editor, findQuery])

  useEffect(() => {
    if (findOpen) {
      countMatches()
    }
  }, [findQuery, findOpen, countMatches])

  const safeReplaceAll = () => {
    if (!editor || !findQuery) return
    const { doc, tr } = editor.state
    let count = 0
    const changes: { from: number; to: number }[] = []

    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        const textLower = node.text.toLowerCase()
        const queryLower = findQuery.toLowerCase()
        let idx = textLower.indexOf(queryLower)
        while (idx !== -1) {
          changes.push({ from: pos + idx, to: pos + idx + findQuery.length })
          count++
          idx = textLower.indexOf(queryLower, idx + queryLower.length)
        }
      }
    })

    // Apply backwards to preserve coordinate validity
    for (let i = changes.length - 1; i >= 0; i--) {
      const { from, to } = changes[i]
      tr.insertText(replaceQuery, from, to)
    }

    if (count > 0) {
      editor.view.dispatch(tr)
      setFindStatus(`Replaced ${count} occurrence${count > 1 ? 's' : ''}`)
    } else {
      setFindStatus('No matches found')
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
    const safe = (active.title || 'document').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'document'
    if (format === 'html') {
      download(`${safe}.html`, `<!doctype html><meta charset="utf-8"><title>${safe}</title><article>${editor.getHTML()}</article>`, 'text/html')
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
        <p>Restoring documents…</p>
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
          title="Exit focus mode (Esc)"
          aria-label="Exit focus mode"
        >
          <Minimize2 size={16} />
          <span>Exit Focus</span>
          <kbd className="kbd-hint">Esc</kbd>
        </button>
      )}

      {/* Sidebar / Document Library */}
      <aside className="documents" aria-label="Documents">
        <div className="docs-head">
          <h1>Documents</h1>
          <button type="button" className="new-btn" onClick={create} aria-label="New document">
            <Plus size={15} /> New
          </button>
        </div>

        <label className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search titles and text…"
            aria-label="Search documents"
          />
        </label>

        <div className="document-list">
          {!filtered.length && needle && <p className="list-empty">Nothing matches “{query.trim()}”.</p>}
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
                  <span className="doc-title">{d.title || 'Untitled document'}</span>
                  <span className="doc-meta">
                    {timeAgo(d.updatedAt)}
                    {preview(d) && <> · {preview(d)}</>}
                  </span>
                </button>
                <div className="doc-actions">
                  <button
                    type="button"
                    className="doc-action-btn"
                    title="Duplicate document"
                    aria-label={`Duplicate ${d.title}`}
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
                    title="Delete document"
                    aria-label={`Delete ${d.title}`}
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
            <Upload size={15} /> Import
          </button>
          <button className="button" onClick={() => void backup()}>
            <Download size={15} /> Backup
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".json,.md,.markdown,.txt,.html,.htm"
            onChange={e => void importFile(e.target.files?.[0])}
          />
          <p>Stored only in this browser. Back up now and then.</p>
        </div>
      </aside>

      {sidebar && <button type="button" className="panel-scrim" aria-label="Close documents" onClick={() => setSidebar(false)} />}

      {/* Main Writer Area */}
      <section className="writer">
        <header className="write-header">
          <button
            className="icon-button"
            onClick={() => setSidebar(v => !v)}
            aria-label={sidebar ? 'Hide documents sidebar' : 'Show documents sidebar'}
            title={sidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </button>

          <SaveIndicator state={save} />

          <div className="header-actions">
            <MenuButton
              label="Export"
              icon={<Download size={15} />}
              items={[
                { label: 'Markdown', hint: '.md', onSelect: () => exportActive('md') },
                { label: 'Plain text', hint: '.txt', onSelect: () => exportActive('txt') },
                { label: 'Web page', hint: '.html', onSelect: () => exportActive('html') },
                'separator',
                { label: 'Print or save as PDF', icon: <Printer size={15} />, onSelect: () => window.print() },
              ]}
            />

            <button
              className="icon-button"
              onClick={() => setFindOpen(v => !v)}
              aria-label="Find and replace"
              title={`Find and replace (${mod()}F)`}
            >
              <Search size={18} />
            </button>

            <button
              className="icon-button"
              onClick={() => setFocus(true)}
              aria-label="Focus mode"
              title="Focus mode (full screen writing)"
            >
              <Focus size={18} />
            </button>
          </div>
        </header>

        {/* Find and Replace Bar */}
        {findOpen && (
          <div className="find-bar" role="search">
            <input
              className="input"
              value={findQuery}
              onChange={e => setFindQuery(e.target.value)}
              placeholder="Find in document…"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') countMatches()
              }}
            />
            <input
              className="input"
              value={replaceQuery}
              onChange={e => setReplaceQuery(e.target.value)}
              placeholder="Replace with…"
              onKeyDown={e => {
                if (e.key === 'Enter') safeReplaceAll()
              }}
            />
            {findStatus && <span className="find-status">{findStatus}</span>}
            <button className="button primary" onClick={safeReplaceAll}>
              Replace all
            </button>
            <button className="icon-button" onClick={() => setFindOpen(false)} aria-label="Close find bar">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Formatting Toolbar */}
        <Toolbar editor={editor} onOpenLink={openLinkDialog} />

        {/* Scrollable Editor Container */}
        <div className="editor-scroll">
          {active ? (
            <article className="page">
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
                aria-label="Document title"
                placeholder="Untitled document"
              />

              {editor && (
                <BubbleMenu editor={editor} className="bubble">
                  <Tool label="Bold" active={editor.isActive('bold')} click={() => editor.chain().focus().toggleBold().run()} icon={<Bold />} />
                  <Tool label="Italic" active={editor.isActive('italic')} click={() => editor.chain().focus().toggleItalic().run()} icon={<Italic />} />
                  <Tool label="Link" active={editor.isActive('link')} click={openLinkDialog} icon={<Link2 />} />
                </BubbleMenu>
              )}

              <EditorContent editor={editor} />

              <footer className="document-stats">
                <span>{words} words</span>
                <span>{chars} characters</span>
                {words > 0 && <span>~{Math.ceil(words / 220)} min read</span>}
              </footer>
            </article>
          ) : (
            <div className="empty">
              <h2>No documents found</h2>
              <button className="button primary" onClick={create}>
                Create a document
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Link Dialog Modal */}
      {linkOpen && (
        <Modal title={editor?.isActive('link') ? 'Edit link' : 'Insert link'} onClose={() => setLinkOpen(false)}>
            <input
              className="input"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              aria-label="Link address"
              data-autofocus
              onKeyDown={e => {
                if (e.key === 'Enter') applyLink()
              }}
            />
            <div className="modal-footer">
              {editor?.isActive('link') && (
                <button type="button" className="button danger" onClick={removeLink}>
                  <Unlink size={15} /> Remove
                </button>
              )}
              <button type="button" className="button" onClick={() => setLinkOpen(false)}>
                Cancel
              </button>
              <button type="button" className="button primary" onClick={applyLink}>
                Save link
              </button>
            </div>
        </Modal>
      )}

      {/* Delete Document Confirmation Modal */}
      {docToDelete && (
        <Modal title="Delete document" onClose={() => setDocToDelete(null)}>
            <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>“{docToDelete.title || 'Untitled document'}”</strong>? This action cannot be undone.
            </p>
            <div className="modal-footer">
              {/* Cancel takes focus: Enter must never delete by accident. */}
              <button type="button" className="button" onClick={() => setDocToDelete(null)} data-autofocus>
                Cancel
              </button>
              <button type="button" className="button danger" onClick={() => void confirmDelete()}>
                Delete
              </button>
            </div>
        </Modal>
      )}

      {/* Notification Toast */}
      {notice && (
        <div className={`toast ${notice.error ? 'error' : ''}`} role="status">
          <span>{notice.text}</span>
          <button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notification">
            <X size={16} />
          </button>
          {notice.offerExport && (
            <button className="button" onClick={() => void backup()}>
              Export backup now
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type Editor = ReturnType<typeof useEditor>

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

function Toolbar({ editor, onOpenLink }: { editor: Editor; onOpenLink: () => void }) {
  if (!editor) return <div className="editor-toolbar" />

  const isTableActive = editor.isActive('table')

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting tools">
      <Tool label="Undo" shortcut="Z" click={() => editor.chain().focus().undo().run()} icon={<Undo2 />} />
      <Tool label="Redo" shortcut="Shift+Z" click={() => editor.chain().focus().redo().run()} icon={<Redo2 />} />

      <span className="separator" />

      <Tool
        label="Heading 1"
        active={editor.isActive('heading', { level: 1 })}
        click={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        icon={<Heading1 />}
      />
      <Tool
        label="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        click={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        icon={<Heading2 />}
      />
      <Tool
        label="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        click={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        icon={<Heading3 />}
      />

      <span className="separator" />

      <Tool label="Bold" shortcut="B" active={editor.isActive('bold')} click={() => editor.chain().focus().toggleBold().run()} icon={<Bold />} />
      <Tool label="Italic" shortcut="I" active={editor.isActive('italic')} click={() => editor.chain().focus().toggleItalic().run()} icon={<Italic />} />
      <Tool label="Underline" shortcut="U" active={editor.isActive('underline')} click={() => editor.chain().focus().toggleUnderline().run()} icon={<UnderlineIcon />} />
      <Tool label="Strikethrough" active={editor.isActive('strike')} click={() => editor.chain().focus().toggleStrike().run()} icon={<Strikethrough />} />
      <Tool label="Inline code" active={editor.isActive('code')} click={() => editor.chain().focus().toggleCode().run()} icon={<Code />} />
      <Tool label="Link" shortcut="K" active={editor.isActive('link')} click={onOpenLink} icon={<Link2 />} />

      <span className="separator" />

      <Tool label="Bullet list" active={editor.isActive('bulletList')} click={() => editor.chain().focus().toggleBulletList().run()} icon={<List />} />
      <Tool label="Numbered list" active={editor.isActive('orderedList')} click={() => editor.chain().focus().toggleOrderedList().run()} icon={<ListOrdered />} />
      <Tool label="Task checklist" active={editor.isActive('taskList')} click={() => editor.chain().focus().toggleTaskList().run()} icon={<Check />} />
      <Tool label="Blockquote" active={editor.isActive('blockquote')} click={() => editor.chain().focus().toggleBlockquote().run()} icon={<Quote />} />

      <span className="separator" />

      <Tool
        label="Insert table (3x3)"
        active={isTableActive}
        click={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        icon={<Table2 />}
      />

      {isTableActive && (
        <div className="table-tools" title="Table management">
          <Tool label="Add row after" click={() => editor.chain().focus().addRowAfter().run()} icon={<Rows />} />
          <Tool label="Delete current row" click={() => editor.chain().focus().deleteRow().run()} icon={<Trash2 />} />
          <Tool label="Add column after" click={() => editor.chain().focus().addColumnAfter().run()} icon={<Plus />} />
          <Tool label="Delete table" click={() => editor.chain().focus().deleteTable().run()} icon={<X />} />
        </div>
      )}

      <span className="separator" />

      <Tool label="Align left" active={editor.isActive({ textAlign: 'left' })} click={() => editor.chain().focus().setTextAlign('left').run()} icon={<AlignLeft />} />
      <Tool label="Align center" active={editor.isActive({ textAlign: 'center' })} click={() => editor.chain().focus().setTextAlign('center').run()} icon={<AlignCenter />} />
      <Tool label="Align right" active={editor.isActive({ textAlign: 'right' })} click={() => editor.chain().focus().setTextAlign('right').run()} icon={<AlignRight />} />

      <span className="separator" />

      <Tool label="Clear formatting" click={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} icon={<X />} />
    </div>
  )
}
