'use client'

import { Copy, Download, PanelLeftClose, Plus, PanelLeftOpen, Pencil, Save, Trash2, Upload, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { db, isQuotaError } from '@/lib/db'
import { useAutosave } from '@/lib/use-autosave'
import { Modal } from '../modal'
import { SaveIndicator } from '../save-indicator'
import { newBoard, type LocalBoard, type SaveState } from '@/lib/models'
import { timeAgo } from '@/lib/time'
import { useTheme } from '../theme-context'
import './create.css'

const Canvas = dynamic(() => import('./tldraw-canvas'), {
  ssr: false,
  loading: () => (
    <div className="center-state">
      <div className="spinner" />
      <p>Loading the infinite canvas…</p>
    </div>
  ),
})

const download = (name: string, value: unknown) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function CreativeWorkspace() {
  const [boards, setBoards] = useState<LocalBoard[]>([])
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState(true)
  const [save, setSave] = useState<SaveState>('idle')
  const [notice, setNotice] = useState<{ text: string; error?: boolean; offerExport?: boolean } | null>(null)

  // Modals state
  const [boardToDelete, setBoardToDelete] = useState<LocalBoard | null>(null)
  const [boardToRename, setBoardToRename] = useState<LocalBoard | null>(null)
  const [renameInput, setRenameInput] = useState('')

  const { theme } = useTheme()
  const editorRef = useRef<Editor | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Boards whose saved snapshot could not be loaded. Autosave is disabled for
  // them so an empty canvas can never overwrite the original drawing.
  const [unreadable, setUnreadable] = useState<string[]>([])
  const unreadableRef = useRef(unreadable)
  unreadableRef.current = unreadable

  const active = boards.find(b => b.id === activeId)
  const activeUnreadable = !!active && unreadable.includes(active.id)

  const autosave = useAutosave<Partial<Pick<LocalBoard, 'title' | 'snapshot'>>>({
    delay: 900,
    write: async (id, patch) => {
      const title = patch.title === undefined ? {} : { title: patch.title.trim() || 'Untitled board' }
      await db.boards.update(id, { ...patch, ...title, updatedAt: new Date().toISOString() })
    },
    onSaving: () => setSave('saving'),
    onSaved: (id, patch) => {
      const updatedAt = new Date().toISOString()
      const snapshot = 'snapshot' in patch ? { snapshot: patch.snapshot } : {}
      setBoards(v => v.map(b => (b.id === id ? { ...b, ...snapshot, updatedAt } : b)))
      setSave('saved')
    },
    onError: err => {
      setSave('error')
      setNotice({
        text: isQuotaError(err)
          ? 'Browser storage is full. Export this board now; the canvas remains open.'
          : 'The board could not be saved. Export it before leaving.',
        error: true,
        offerExport: true,
      })
    },
  })

  // Confirmations fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (!notice || notice.error) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const selectBoard = (id: string) => {
    if (window.matchMedia('(max-width: 700px)').matches) setPanel(false)
    if (id === activeId) return
    void autosave.flush()
    setActiveId(id)
  }

  const refresh = useCallback(async (id?: string) => {
    const all = await db.boards.orderBy('updatedAt').reverse().toArray()
    setBoards(all)
    const wanted = id || localStorage.getItem('my-space:last-board') || all[0]?.id
    if (wanted) {
      setActiveId(all.some(b => b.id === wanted) ? wanted : all[0]?.id)
    }
  }, [])

  useEffect(() => {
    // On phones the board list is an overlay; start with the canvas visible.
    if (window.matchMedia('(max-width: 700px)').matches) setPanel(false)
    void (async () => {
      try {
        let all = await db.boards.toArray()
        if (!all.length) {
          // Fixed id + put: seeding twice (StrictMode, two tabs) can't create duplicates.
          const first = { ...newBoard('Ideas board'), id: 'first-board' }
          await db.boards.put(first)
          all = [first]
        }
        await refresh()
      } catch {
        setNotice({ text: 'Canvas storage is unavailable. You can draw, but export before leaving.', error: true })
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  useEffect(() => {
    if (activeId) {
      localStorage.setItem('my-space:last-board', activeId)
    }
  }, [activeId])

  // Shrinking to phone width (rotation, split screen) turns the list into an
  // overlay; close it so it doesn't suddenly cover the canvas.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)')
    const onChange = () => query.matches && setPanel(false)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const create = async () => {
    await autosave.flush()
    const b = newBoard()
    await db.boards.add(b)
    await refresh(b.id)
  }

  const openRenameModal = (b: LocalBoard) => {
    setBoardToRename(b)
    setRenameInput(b.title)
  }

  const confirmRename = async () => {
    if (!boardToRename) return
    const title = renameInput.trim() || 'Untitled board'
    await db.boards.update(boardToRename.id, { title, updatedAt: new Date().toISOString() })
    setBoards(v => v.map(b => (b.id === boardToRename.id ? { ...b, title } : b)))
    setBoardToRename(null)
  }

  const updateHeaderTitle = (title: string) => {
    if (!active) return
    setBoards(v => v.map(b => (b.id === active.id ? { ...b, title } : b)))
    autosave.queue(active.id, { title })
  }

  const duplicate = async (b: LocalBoard) => {
    await autosave.flush()
    const copy = {
      ...b,
      id: crypto.randomUUID(),
      title: `${b.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await db.boards.add(copy)
    await refresh(copy.id)
    setNotice({ text: `Duplicated "${copy.title}"` })
  }

  const confirmDelete = async () => {
    if (!boardToDelete) return
    const target = boardToDelete
    setBoardToDelete(null)
    await db.boards.delete(target.id)
    const rest = boards.filter(x => x.id !== target.id)
    if (!rest.length) {
      const fresh = newBoard()
      await db.boards.add(fresh)
      await refresh(fresh.id)
    } else {
      await refresh(rest[0].id)
    }
    setNotice({ text: `Deleted "${target.title}"` })
  }

  const boardLoadFailed = (id: string) => {
    setUnreadable(v => (v.includes(id) ? v : [...v, id]))
    setNotice({
      text: 'This board could not be opened, so changes to it are not saved. Export it to keep the original.',
      error: true,
      offerExport: true,
    })
  }

  const importBoard = async (file?: File) => {
    if (!file) return
    try {
      const raw = await file.text()
      const data = JSON.parse(raw) as { format?: string; snapshot?: unknown; title?: string; tldrawFileFormatVersion?: number }
      const tldraw = await import('tldraw')
      let snapshot: unknown
      if (data.tldrawFileFormatVersion) {
        // A native .tldr file, e.g. saved from tldraw.com.
        const parsed = tldraw.parseTldrawJsonFile({ json: raw, schema: tldraw.createTLSchema() })
        if (!parsed.ok) throw new Error('unreadable .tldr')
        snapshot = tldraw.getSnapshot(parsed.value)
      } else if (data.format === 'my-space-board' && data.snapshot === null) {
        snapshot = null // an exported board that was never drawn on
      } else {
        snapshot = data.format === 'my-space-board' ? data.snapshot : data
        const shape = snapshot as { store?: unknown; schema?: unknown; document?: { store?: unknown; schema?: unknown } }
        const records = shape?.document ?? shape
        if (!records || typeof records.store !== 'object' || typeof records.schema !== 'object') throw new Error('not a snapshot')
        // Throws when the records are not a loadable tldraw snapshot, so a
        // broken file is rejected instead of being imported as an empty board.
        tldraw.createTLStore({
          shapeUtils: tldraw.defaultShapeUtils,
          bindingUtils: tldraw.defaultBindingUtils,
          snapshot: snapshot as Parameters<typeof tldraw.loadSnapshot>[1],
        })
      }
      await autosave.flush()
      const b = newBoard(data.title || file.name.replace(/(\.tldr)?(\.json)?$/i, '') || 'Imported board')
      b.snapshot = snapshot
      await db.boards.add(b)
      await refresh(b.id)
      setNotice({ text: `Board "${b.title}" imported.` })
    } catch {
      setNotice({ text: 'This file is not a board that My Space or tldraw can open. Nothing was imported.', error: true })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <p>Restoring boards…</p>
      </div>
    )
  }

  return (
    <div className="creative">
      {/* Board Panel Sidebar */}
      <aside className={`board-panel ${panel ? '' : 'closed'}`} aria-label="Boards navigation">
        <div className="board-heading">
          <h1>Boards</h1>
          <button type="button" className="new-btn" onClick={create} aria-label="New board">
            <Plus size={15} /> New
          </button>
        </div>

        <div className="board-list">
          {boards.map(b => {
            const isActive = b.id === activeId
            return (
              <div key={b.id} className={`board-row ${isActive ? 'active' : ''}`}>
                <button
                  type="button"
                  className="board-select-btn"
                  onClick={() => selectBoard(b.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="board-copy">
                    <strong>{b.title}</strong>
                    <small>{timeAgo(b.updatedAt)}</small>
                  </span>
                </button>

                <div className="board-actions">
                  <button
                    type="button"
                    className="board-action-btn"
                    title="Rename board"
                    aria-label={`Rename ${b.title}`}
                    onClick={e => {
                      e.stopPropagation()
                      openRenameModal(b)
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="board-action-btn"
                    title="Duplicate board"
                    aria-label={`Duplicate ${b.title}`}
                    onClick={e => {
                      e.stopPropagation()
                      void duplicate(b)
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className="board-action-btn delete-btn"
                    title="Delete board"
                    aria-label={`Delete ${b.title}`}
                    onClick={e => {
                      e.stopPropagation()
                      setBoardToDelete(b)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="board-footer">
          <button className="button" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import board
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".json,.tldr"
            onChange={e => void importBoard(e.target.files?.[0])}
          />
          <p>Stored only in this browser. PNG and SVG export are in the canvas menu.</p>
        </div>
      </aside>

      {panel && <button type="button" className="panel-scrim" aria-label="Close boards" onClick={() => setPanel(false)} />}

      {/* Canvas Area */}
      <section className="canvas-area">
        <header className="canvas-header">
          <button
            className="icon-button"
            onClick={() => setPanel(v => !v)}
            aria-label={panel ? 'Hide boards sidebar' : 'Show boards sidebar'}
            title={panel ? 'Hide sidebar' : 'Show sidebar'}
          >
            {panel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div className="header-title-wrap">
            {active && (
              <input
                className="header-title-input"
                value={active.title}
                onChange={e => updateHeaderTitle(e.target.value)}
                aria-label="Board title"
                title="Click to rename board"
                placeholder="Untitled board"
              />
            )}
          </div>

          <SaveIndicator state={save} blocked={activeUnreadable} />

          <div className="canvas-header-actions">
            {active && (
              <button
                className="icon-button"
                onClick={() =>
                  download(`${active.title}.tldr.json`, {
                    format: 'my-space-board',
                    version: 1,
                    title: active.title,
                    snapshot: active.snapshot,
                  })
                }
                title="Export board (.json)"
                aria-label="Export board"
              >
                <Download size={17} />
              </button>
            )}
          </div>
        </header>

        <div className="canvas-wrap">
          {active && (
            <Canvas
              key={active.id}
              snapshot={active.snapshot}
              theme={theme}
              onEditor={e => (editorRef.current = e)}
              onChange={snapshot => {
                if (!unreadableRef.current.includes(active.id)) autosave.queue(active.id, { snapshot })
              }}
              onLoadError={() => boardLoadFailed(active.id)}
            />
          )}
        </div>
      </section>

      {/* Rename Board Modal */}
      {boardToRename && (
        <Modal title="Rename board" onClose={() => setBoardToRename(null)}>
          <input
            className="input"
            value={renameInput}
            onChange={e => setRenameInput(e.target.value)}
            placeholder="Board name"
            aria-label="Board name"
            data-autofocus
            onKeyDown={e => {
              if (e.key === 'Enter') void confirmRename()
            }}
          />
          <div className="modal-footer">
            <button type="button" className="button" onClick={() => setBoardToRename(null)}>
              Cancel
            </button>
            <button type="button" className="button primary" onClick={() => void confirmRename()}>
              Save name
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Board Confirmation Modal */}
      {boardToDelete && (
        <Modal title="Delete board" onClose={() => setBoardToDelete(null)}>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Are you sure you want to delete <strong>“{boardToDelete.title}”</strong>? This action cannot be undone.
          </p>
          <div className="modal-footer">
            {/* Cancel takes focus: Enter must never delete by accident. */}
            <button type="button" className="button" onClick={() => setBoardToDelete(null)} data-autofocus>
              Cancel
            </button>
            <button type="button" className="button danger" onClick={() => void confirmDelete()}>
              Delete
            </button>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {notice && (
        <div className={`toast ${notice.error ? 'error' : ''}`} role="status">
          <span>{notice.text}</span>
          <button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notification">
            <X size={16} />
          </button>
          {notice.offerExport && active && (
            <button className="button" onClick={() => download(`${active.title}.json`, active.snapshot)}>
              <Save size={14} /> Export now
            </button>
          )}
        </div>
      )}
    </div>
  )
}
