'use client'

import { Aperture, Camera, Copy, Download, ImageDown, PanelLeftClose, Plus, PanelLeftOpen, Pencil, Save, Trash2, Upload, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { db, isQuotaError } from '@/lib/db'
import { useAutosave } from '@/lib/use-autosave'
import { Modal } from '../modal'
import { SaveIndicator } from '../save-indicator'
import { MenuButton } from '../menu-button'
import { CaptureScreenButton } from '../screen-capture'
import { sendImage, takeImage } from '@/lib/image-inbox'
import { useRouter } from 'next/navigation'
import { newBoard, type LocalBoard, type SaveState } from '@/lib/models'
import { timeAgo } from '@/lib/time'
import { useTheme } from '../theme-context'
import { detectLang, getLang, rich, translate, useI18n } from '@/lib/i18n'
import './create.css'

const Canvas = dynamic(() => import('./tldraw-canvas'), {
  ssr: false,
  loading: () => (
    <div className="center-state">
      <div className="spinner" />
      <p>{translate('Loading the infinite canvas…', undefined, getLang())}</p>
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
  const { t, lang } = useI18n()
  const router = useRouter()
  // An image to drop onto the board once its canvas is ready (from Frame).
  const pendingImage = useRef<File | null>(null)
  const titleOf = (title: string) => (!title || title === 'Untitled board' || title === 'Bảng vẽ chưa đặt tên' ? t('Untitled board') : title)
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
      const title = patch.title === undefined ? {} : { title: patch.title.trim() || t('Untitled board') }
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
          ? t('Browser storage is full. Export this board now; the canvas remains open.')
          : t('The board could not be saved. Export it before leaving.'),
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
          const first = { ...newBoard(translate('Ideas board', undefined, detectLang())), id: 'first-board' }
          await db.boards.put(first)
          all = [first]
        }
        const incoming = takeImage('create')
        if (incoming) {
          // Arrived from Frame → "Annotate in Create": a fresh board with the image on it.
          const b = newBoard(translate('Screenshot', undefined, detectLang()))
          await db.boards.add(b)
          pendingImage.current = new File([incoming], 'screenshot.png', { type: 'image/png' })
          await refresh(b.id)
        } else await refresh()
      } catch {
        setNotice({ text: translate('Canvas storage is unavailable. You can draw, but export before leaving.', undefined, detectLang()), error: true })
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
    const b = newBoard(t('Untitled board'))
    await db.boards.add(b)
    await refresh(b.id)
  }

  const openRenameModal = (b: LocalBoard) => {
    setBoardToRename(b)
    setRenameInput(b.title)
  }

  const confirmRename = async () => {
    if (!boardToRename) return
    const title = renameInput.trim() || t('Untitled board')
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
      title: t('{title} (Copy)', { title: titleOf(b.title) }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await db.boards.add(copy)
    await refresh(copy.id)
    setNotice({ text: t('Duplicated "{title}"', { title: copy.title }) })
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
    setNotice({ text: t('Deleted "{title}"', { title: titleOf(target.title) }) })
  }

  // Picture of the drawing: the selection if there is one, else the whole page.
  const capture = (mode: 'copy' | 'save') => {
    const editor = editorRef.current
    if (!editor || !active) return
    const selected = editor.getSelectedShapeIds()
    const ids = selected.length ? selected : [...editor.getCurrentPageShapeIds()]
    if (!ids.length) {
      setNotice({ text: t('Draw something first, then capture it.') })
      return
    }
    const image = editor.toImage(ids, { format: 'png', background: true, padding: 24, scale: 2 }).then(r => r.blob)
    const sel = selected.length > 0
    if (mode === 'copy' && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      // Hand the clipboard a promise so Safari keeps the click's permission.
      navigator.clipboard
        .write([new ClipboardItem({ 'image/png': image })])
        .then(() => setNotice({ text: t(sel ? 'Selection copied as an image — paste it anywhere.' : 'Board copied as an image — paste it anywhere.') }))
        .catch(() => void saveBlob(image, t("Copying isn't allowed here, so the image was saved instead.")))
      return
    }
    void saveBlob(image, t(sel ? 'Selection saved as PNG.' : 'Board saved as PNG.'))
  }

  const saveBlob = async (image: Promise<Blob>, message: string) => {
    try {
      const blob = await image
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(active?.title || 'board').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'board'}.png`
      a.click()
      URL.revokeObjectURL(a.href)
      setNotice({ text: message })
    } catch {
      setNotice({ text: t('The image could not be created.'), error: true })
    }
  }

  const placeImage = async (file: File) => {
    const editor = editorRef.current
    if (!editor) return
    await editor.putExternalContent({ type: 'files', files: [file], point: editor.getViewportPageBounds().center })
    editor.zoomToSelection({ animation: { duration: 300 } })
  }

  const frameIt = async () => {
    const editor = editorRef.current
    if (!editor) return
    const selected = editor.getSelectedShapeIds()
    const ids = selected.length ? selected : [...editor.getCurrentPageShapeIds()]
    if (!ids.length) return setNotice({ text: t('Draw something first, then capture it.') })
    try {
      const { blob } = await editor.toImage(ids, { format: 'png', background: true, padding: 16, scale: 2 })
      sendImage('frame', blob)
      router.push('/frame')
    } catch {
      setNotice({ text: t('The image could not be created.'), error: true })
    }
  }

  const boardLoadFailed = (id: string) => {
    setUnreadable(v => (v.includes(id) ? v : [...v, id]))
    setNotice({
      text: t('This board could not be opened, so changes to it are not saved. Export it to keep the original.'),
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
      const b = newBoard(data.title || file.name.replace(/(\.tldr)?(\.json)?$/i, '') || t('Imported board'))
      b.snapshot = snapshot
      await db.boards.add(b)
      await refresh(b.id)
      setNotice({ text: t('Board "{title}" imported.', { title: b.title }) })
    } catch {
      setNotice({ text: t('This file is not a board that My Space or tldraw can open. Nothing was imported.'), error: true })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
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
    <div className="creative">
      {/* Board Panel Sidebar */}
      <aside className={`board-panel ${panel ? '' : 'closed'}`} aria-label={t('Boards navigation')}>
        <div className="board-heading">
          <h1>{t('Boards')}</h1>
          <button type="button" className="new-btn" onClick={create} aria-label={t('New board')}>
            <Plus size={15} /> {t('New')}
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
                    <strong>{titleOf(b.title)}</strong>
                    <small>{timeAgo(b.updatedAt)}</small>
                  </span>
                </button>

                <div className="board-actions">
                  <button
                    type="button"
                    className="board-action-btn"
                    title={t('Rename board')}
                    aria-label={t('Rename {title}', { title: titleOf(b.title) })}
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
                    title={t('Duplicate board')}
                    aria-label={t('Duplicate {title}', { title: titleOf(b.title) })}
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
                    title={t('Delete board')}
                    aria-label={t('Delete {title}', { title: titleOf(b.title) })}
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
            <Upload size={15} /> {t('Import board')}
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".json,.tldr"
            onChange={e => void importBoard(e.target.files?.[0])}
          />
          <p>{t('Stored only in this browser. PNG and SVG export are in the canvas menu.')}</p>
        </div>
      </aside>

      {panel && <button type="button" className="panel-scrim" aria-label={t('Close boards')} onClick={() => setPanel(false)} />}

      {/* Canvas Area */}
      <section className="canvas-area">
        <header className="canvas-header">
          <button
            className="icon-button"
            onClick={() => setPanel(v => !v)}
            aria-label={t(panel ? 'Hide boards sidebar' : 'Show boards sidebar')}
            title={t(panel ? 'Hide sidebar' : 'Show sidebar')}
          >
            {panel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div className="header-title-wrap">
            {active && (
              <input
                className="header-title-input"
                value={active.title}
                onChange={e => updateHeaderTitle(e.target.value)}
                aria-label={t('Board title')}
                title={t('Click to rename board')}
                placeholder={t('Untitled board')}
              />
            )}
          </div>

          <SaveIndicator state={save} blocked={activeUnreadable} />

          <div className="canvas-header-actions">
            {active && (
              <MenuButton
                label={t('Capture')}
                icon={<Camera size={15} />}
                items={[
                  { label: t('Copy image'), hint: t('paste anywhere'), icon: <Copy size={15} />, onSelect: () => capture('copy') },
                  { label: t('Save PNG'), icon: <ImageDown size={15} />, onSelect: () => capture('save') },
                  'separator',
                  { label: t('Frame it'), icon: <Aperture size={15} />, onSelect: () => void frameIt() },
                ]}
              />
            )}
            {active && (
              <CaptureScreenButton
                onImage={file => {
                  void placeImage(file)
                  setNotice({ text: t('Screenshot added to the board.') })
                }}
                onError={text => setNotice({ text, error: true })}
              />
            )}
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
                title={t('Export board (.json)')}
                aria-label={t('Export board')}
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
              locale={lang}
              onEditor={e => {
                editorRef.current = e
                const file = pendingImage.current
                if (file) {
                  pendingImage.current = null
                  // Let the board finish loading its snapshot first.
                  setTimeout(() => void placeImage(file), 50)
                }
              }}
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
        <Modal title={t('Rename board')} onClose={() => setBoardToRename(null)}>
          <input
            className="input"
            value={renameInput}
            onChange={e => setRenameInput(e.target.value)}
            placeholder={t('Board name')}
            aria-label={t('Board name')}
            data-autofocus
            onKeyDown={e => {
              if (e.key === 'Enter') void confirmRename()
            }}
          />
          <div className="modal-footer">
            <button type="button" className="button" onClick={() => setBoardToRename(null)}>
              {t('Cancel')}
            </button>
            <button type="button" className="button primary" onClick={() => void confirmRename()}>
              {t('Save name')}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Board Confirmation Modal */}
      {boardToDelete && (
        <Modal title={t('Delete board')} onClose={() => setBoardToDelete(null)}>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            {rich(t('Are you sure you want to delete **“{title}”**? This action cannot be undone.', { title: titleOf(boardToDelete.title) }))}
          </p>
          <div className="modal-footer">
            {/* Cancel takes focus: Enter must never delete by accident. */}
            <button type="button" className="button" onClick={() => setBoardToDelete(null)} data-autofocus>
              {t('Cancel')}
            </button>
            <button type="button" className="button danger" onClick={() => void confirmDelete()}>
              {t('Delete')}
            </button>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {notice && (
        <div className={`toast ${notice.error ? 'error' : ''}`} role="status">
          <span>{notice.text}</span>
          <button className="icon-button" onClick={() => setNotice(null)} aria-label={t('Dismiss notification')}>
            <X size={16} />
          </button>
          {notice.offerExport && active && (
            <button className="button" onClick={() => download(`${active.title}.json`, active.snapshot)}>
              <Save size={14} /> {t('Export now')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
