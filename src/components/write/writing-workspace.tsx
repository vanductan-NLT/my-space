'use client'

import { BubbleMenu, EditorContent, generateJSON, useEditor } from '@tiptap/react'
import { fontFamily } from './fonts'
import { InlineFontChips, PageFontButton } from './font-controls'
import { AlignButtons, BubbleDropdown, ColorPanel, currentBlockLabel, MoreButtons, SizeButtons, TurnInto } from './format-controls'
import {
  ChevronRight, Pin, PinOff, Edit2, CornerRightUp, Bold, Code, Columns2, Copy, Download, Italic, Link2, PanelLeftClose,
  PanelLeftOpen, Plus, Printer, Rows, Search, Strikethrough, Trash2, Underline as UnderlineIcon, Unlink, Upload, X,
  FolderPlus, Sparkles,
} from 'lucide-react'
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
import { EMPTY_CONTENT, newDocument, newFolder, type LocalDocument, type LocalFolder, type SaveState } from '@/lib/models'
import { timeAgo } from '@/lib/time'
import { detectLang, getLang, rich, translate, useI18n } from '@/lib/i18n'
import './write.css'
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

const FOLDER_EMOJIS = ['📁', '🎓', '💻', '🔬', '📚', '🚀', '📝', '🎯', '⭐', '⚙️', '🧪', '💡']
const DOC_EMOJIS = ['📄', '🎓', '💻', '🔬', '📝', '💡', '📊', '🚀', '📌', '🎯', '⚙️', '🧪', '📖', '📁', '☕', '✅', '⚠️', '💬']

export default function WritingWorkspace() {
  const { t } = useI18n()
  // Untitled documents keep the default name in whatever language is shown.
  const titleOf = (title: string) => (!title || title === 'Untitled document' || title === 'Tài liệu chưa đặt tên' ? t('Untitled document') : title)
  const [docs, setDocs] = useState<LocalDocument[]>([])
  const [folders, setFolders] = useState<LocalFolder[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderTitle, setEditingFolderTitle] = useState('')
  const [movingDocId, setMovingDocId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState<SaveState>('idle')
  const [sidebar, setSidebar] = useState(true)
  const { active: focus } = useFullMode()
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean; offerExport?: boolean } | null>(null)

  // New folder dialog state
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderIcon, setNewFolderIcon] = useState('📁')

  // Safe delete folder state
  const [folderToDelete, setFolderToDelete] = useState<LocalFolder | null>(null)
  const [deleteWithDocs, setDeleteWithDocs] = useState(false)

  // Drag and drop feedback state
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverUncategorized, setDragOverUncategorized] = useState(false)

  // Document page icon picker state
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

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
  const activeFolder = active?.folderId ? folders.find(f => f.id === active.folderId) : undefined

  const autosave = useAutosave<Partial<Pick<LocalDocument, 'title' | 'content' | 'font' | 'icon'>>>({
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
    const allFolders = await db.folders.toArray()
    setFolders(allFolders.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    setDocs(all.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return b.updatedAt.localeCompare(a.updatedAt)
    }))
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
        const allFolders = await db.folders.toArray()
        setFolders(allFolders.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        if (!all.length) {
          // Fixed id + put: seeding twice (StrictMode, two tabs) can't create duplicates.
          const tt = (key: string) => translate(key, undefined, detectLang())
          const first = { ...newDocument(tt('Welcome to My Space'), '🎓'), id: 'welcome' }
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openLinkDialog()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openLinkDialog])

  const togglePin = async (d: LocalDocument) => {
    await db.documents.update(d.id, { isPinned: !d.isPinned })
    await refresh(activeId)
  }

  const updateDocIcon = async (icon: string) => {
    if (!active) return
    setDocs(v => v.map(d => (d.id === active.id ? { ...d, icon } : d)))
    await db.documents.update(active.id, { icon, updatedAt: new Date().toISOString() })
    setIconPickerOpen(false)
  }

  const renameFolder = async (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      await db.folders.update(id, { title: newTitle.trim(), updatedAt: new Date().toISOString() })
      await refresh(activeId)
    }
    setEditingFolderId(null)
  }

  const handleCreateFolder = async () => {
    const title = newFolderName.trim() || t('New folder')
    const f = newFolder(title, newFolderIcon)
    await db.folders.add(f)
    setExpandedFolders(prev => new Set(prev).add(f.id))
    setNewFolderOpen(false)
    setNewFolderName('')
    setNewFolderIcon('📁')
    await refresh(activeId)
    setNotice({ text: t('Created folder "{title}"', { title: f.title }) })
  }

  const create = async (folderId?: string) => {
    await autosave.flush()
    const d = { ...newDocument(t('Untitled document'), folderId ? '📝' : '📄'), folderId }
    await db.documents.add(d)
    if (folderId) {
      setExpandedFolders(prev => new Set(prev).add(folderId))
    }
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

  const handleSafeDeleteFolder = async () => {
    if (!folderToDelete) return
    const f = folderToDelete
    const docsInFolder = docs.filter(d => d.folderId === f.id)

    if (deleteWithDocs) {
      for (const d of docsInFolder) {
        await db.documents.delete(d.id)
      }
    } else {
      for (const d of docsInFolder) {
        await db.documents.update(d.id, { folderId: undefined, updatedAt: new Date().toISOString() })
      }
    }

    await db.folders.delete(f.id)
    setFolderToDelete(null)
    setDeleteWithDocs(false)
    await refresh(activeId)
    setNotice({ text: t('Deleted "{title}"', { title: f.title }) })
  }

  const applyTemplate = (type: 'thesis' | 'progress' | 'meeting' | 'blank') => {
    if (!editor || !active) return
    if (type === 'blank') {
      editor.commands.clearContent(true)
      editor.commands.focus()
      return
    }

    let html = ''
    let newTitle = ''
    let icon = '📄'

    if (type === 'thesis') {
      newTitle = t('Thesis / Project outline')
      icon = '🎓'
      html = `
        <h1>${t('Thesis / Project outline')}</h1>
        <div data-type="callout" data-icon="💡" class="notion-callout">
          <span class="callout-icon" contenteditable="false">💡</span>
          <div class="callout-body"><p>Lưu ý: Hạn nộp đề cương và báo cáo định kỳ theo hướng dẫn của Giảng viên.</p></div>
        </div>
        <h2>1. Tổng quan & Đặt vấn đề</h2>
        <p>Mô tả ngắn gọn bối cảnh nghiên cứu, tính cấp thiết và bài toán thực tế cần giải quyết...</p>
        <h2>2. Công nghệ & Kiến trúc dự kiến</h2>
        <ul>
          <li><p>Frontend / Ứng dụng: Next.js, React, Tailwind CSS...</p></li>
          <li><p>Backend / API: Node.js, Python, PostgreSQL / Dexie...</p></li>
          <li><p>Mô hình / Thuật toán: AI / Machine Learning, Cloud Services...</p></li>
        </ul>
        <h2>3. Kế hoạch các mốc tiến độ (Milestones)</h2>
        <ul data-type="taskList">
          <li data-type="taskItem" data-checked="false"><p>Thu thập tài liệu và khảo sát hiện trạng</p></li>
          <li data-type="taskItem" data-checked="false"><p>Thiết kế kiến trúc hệ thống và cơ sở dữ liệu</p></li>
          <li data-type="taskItem" data-checked="false"><p>Phát triển chức năng cốt lõi (Core features)</p></li>
          <li data-type="taskItem" data-checked="false"><p>Thử nghiệm, đánh giá kết quả và viết báo cáo</p></li>
        </ul>
        <h2>4. Bảng phân công & Dự kiến thời gian</h2>
        <table>
          <thead><tr><th><p>Giai đoạn</p></th><th><p>Nội dung</p></th><th><p>Hạn chót</p></th></tr></thead>
          <tbody>
            <tr><td><p>Sprint 1</p></td><td><p>Khảo sát & Thiết kế</p></td><td><p>Tuần 2</p></td></tr>
            <tr><td><p>Sprint 2</p></td><td><p>Xây dựng nguyên mẫu (MVP)</p></td><td><p>Tuần 6</p></td></tr>
            <tr><td><p>Sprint 3</p></td><td><p>Hoàn thiện & Báo cáo</p></td><td><p>Tuần 10</p></td></tr>
          </tbody>
        </table>
        <p></p>
      `
    } else if (type === 'progress') {
      newTitle = t('Weekly progress report')
      icon = '📋'
      html = `
        <h1>${t('Weekly progress report')}</h1>
        <div data-type="callout" data-icon="📌" class="notion-callout">
          <span class="callout-icon" contenteditable="false">📌</span>
          <div class="callout-body"><p>Tiến độ: Đúng kế hoạch 🟢 | Mục tiêu tuần này: Hoàn thiện module chính</p></div>
        </div>
        <h2>1. Công việc đã hoàn thành</h2>
        <ul data-type="taskList">
          <li data-type="taskItem" data-checked="true"><p>Hoàn thành tài liệu phân tích yêu cầu</p></li>
          <li data-type="taskItem" data-checked="true"><p>Thiết kế luồng dữ liệu và sơ đồ lớp</p></li>
          <li data-type="taskItem" data-checked="false"><p>Code giao diện người dùng bước đầu</p></li>
        </ul>
        <h2>2. Vấn đề & Thách thức cần giải quyết</h2>
        <blockquote><p>Ghi lại các lỗi (bugs), khó khăn kỹ thuật hoặc vấn đề cần tham vấn ý kiến GVHD tại đây...</p></blockquote>
        <h2>3. Kế hoạch công việc tuần tới</h2>
        <ul data-type="taskList">
          <li data-type="taskItem" data-checked="false"><p>Tích hợp API và kiểm thử luồng chức năng</p></li>
          <li data-type="taskItem" data-checked="false"><p>Chuẩn bị slide báo cáo cho buổi họp tiếp theo</p></li>
        </ul>
        <p></p>
      `
    } else if (type === 'meeting') {
      newTitle = t('Supervisor meeting notes')
      icon = '👨‍🏫'
      html = `
        <h1>${t('Supervisor meeting notes')}</h1>
        <div data-type="callout" data-icon="👨‍🏫" class="notion-callout">
          <span class="callout-icon" contenteditable="false">👨‍🏫</span>
          <div class="callout-body"><p>Thời gian: [Điền ngày/giờ] | GVHD: TS. / ThS. [Họ và tên]</p></div>
        </div>
        <h2>1. Nội dung đã báo cáo</h2>
        <ul>
          <li><p>Tóm tắt các kết quả đạt được từ buổi họp trước</p></li>
          <li><p>Demo sản phẩm hoặc trình bày sơ đồ hệ thống</p></li>
        </ul>
        <h2>2. Nhận xét & Đóng góp ý kiến của Thầy/Cô</h2>
        <blockquote><p>Ghi chú lại chính xác các góp ý, định hướng phương pháp và tài liệu GVHD gợi ý đọc thêm...</p></blockquote>
        <h2>3. Các việc cần sửa đổi và hoàn thành (Action Items)</h2>
        <ul data-type="taskList">
          <li data-type="taskItem" data-checked="false"><p>Chỉnh sửa cấu trúc chương 2 theo góp ý của thầy/cô</p></li>
          <li data-type="taskItem" data-checked="false"><p>Bổ sung thêm biểu đồ so sánh hiệu năng</p></li>
          <li data-type="taskItem" data-checked="false"><p>Gửi lại bản cập nhật trước [Ngày hẹn]</p></li>
        </ul>
        <p></p>
      `
    }

    editor.commands.setContent(html)
    if (active.title === t('Untitled document') || !active.title) {
      updateTitle(newTitle)
    }
    void updateDocIcon(icon)
    editor.commands.focus('start')
  }

  const renderDocumentRow = (d: LocalDocument) => {
    const isActive = d.id === activeId
    return (
      <div
        className={`document-row ${isActive ? 'active' : ''}`}
        key={d.id}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('text/plain', d.id)
        }}
      >
        <button
          type="button"
          className="doc-select-btn"
          onClick={() => selectDocument(d.id)}
          aria-current={isActive ? 'true' : undefined}
        >
          <span className="doc-title">
            {d.isPinned && <Pin size={12} className="pinned-icon" />}
            <span className="doc-icon">{d.icon || '📄'}</span>
            {titleOf(d.title)}
          </span>
          <span className="doc-meta">
            {timeAgo(d.updatedAt)}
            {preview(d) && <> · {preview(d)}</>}
          </span>
        </button>
        <div className="doc-actions">
          <button
            type="button"
            className="doc-action-btn"
            title={t('Move to folder')}
            onClick={e => {
              e.stopPropagation()
              setMovingDocId(d.id)
            }}
          >
            <CornerRightUp size={14} />
          </button>
          <button
            type="button"
            className="doc-action-btn"
            title={d.isPinned ? t('Unpin note') : t('Pin note')}
            onClick={e => {
              e.stopPropagation()
              void togglePin(d)
            }}
          >
            {d.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
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
      {/* Sidebar / Document Library */}
      <aside className="documents" aria-label={t('Documents')}>
        <div className="docs-head">
          <h1>{t('Documents')}</h1>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className="new-btn"
              onClick={() => {
                setNewFolderName('')
                setNewFolderIcon('📁')
                setNewFolderOpen(true)
              }}
              aria-label={t('New folder')}
              title={t('New folder')}
            >
              <FolderPlus size={15} />
            </button>
            <button type="button" className="new-btn" onClick={() => create(undefined)} aria-label={t('New document')}>
              <Plus size={15} /> {t('New')}
            </button>
          </div>
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

          {/* Folders Section */}
          {!needle && folders.length > 0 && (
            <div className="folders-section-header">
              <span>{t('Folders')}</span>
            </div>
          )}

          {!needle && folders.map(f => {
            const isExpanded = expandedFolders.has(f.id)
            const folderDocs = docs.filter(d => d.folderId === f.id)
            const isDragTarget = dragOverFolderId === f.id
            return (
              <div
                key={f.id}
                className={`folder-group ${isDragTarget ? 'drag-over' : ''}`}
                onDragOver={e => {
                  e.preventDefault()
                  if (dragOverFolderId !== f.id) setDragOverFolderId(f.id)
                }}
                onDragLeave={() => {
                  if (dragOverFolderId === f.id) setDragOverFolderId(null)
                }}
                onDrop={async e => {
                  e.preventDefault()
                  setDragOverFolderId(null)
                  const docId = e.dataTransfer.getData('text/plain')
                  if (docId) {
                    await db.documents.update(docId, { folderId: f.id, updatedAt: new Date().toISOString() })
                    setExpandedFolders(prev => new Set(prev).add(f.id))
                    await refresh(activeId)
                    const targetDoc = docs.find(d => d.id === docId)
                    if (targetDoc) {
                      setNotice({ text: t('Moved "{title}" to "{folder}"', { title: titleOf(targetDoc.title), folder: f.title }) })
                    }
                  }
                }}
              >
                <div className="folder-row">
                  {editingFolderId === f.id ? (
                    <input
                      className="folder-rename-input"
                      autoFocus
                      value={editingFolderTitle}
                      onChange={e => setEditingFolderTitle(e.target.value)}
                      onBlur={() => void renameFolder(f.id, editingFolderTitle)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void renameFolder(f.id, editingFolderTitle)
                        if (e.key === 'Escape') setEditingFolderId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="folder-toggle"
                      onClick={() => {
                        const next = new Set(expandedFolders)
                        if (isExpanded) next.delete(f.id)
                        else next.add(f.id)
                        setExpandedFolders(next)
                      }}
                    >
                      <ChevronRight size={14} className={`folder-chevron ${isExpanded ? 'open' : ''}`} />
                      <span className="folder-icon">{f.icon || '📁'}</span>
                      <span className="folder-title">{f.title}</span>
                      <span className="folder-count">{folderDocs.length}</span>
                    </button>
                  )}

                  <div className="doc-actions">
                    <button
                      type="button"
                      className="doc-action-btn"
                      title={t('New document in folder')}
                      onClick={e => {
                        e.stopPropagation()
                        void create(f.id)
                      }}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="doc-action-btn"
                      title={t('Rename folder')}
                      onClick={e => {
                        e.stopPropagation()
                        setEditingFolderTitle(f.title)
                        setEditingFolderId(f.id)
                      }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      className="doc-action-btn delete-btn"
                      title={t('Delete folder')}
                      onClick={e => {
                        e.stopPropagation()
                        setFolderToDelete(f)
                        setDeleteWithDocs(false)
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="folder-contents">
                    {folderDocs.map(d => renderDocumentRow(d))}
                    {folderDocs.length === 0 && (
                      <div className="folder-empty-state">
                        <p className="folder-empty-text">{t('Empty folder')}</p>
                        <button
                          type="button"
                          className="folder-add-quick-btn"
                          onClick={() => void create(f.id)}
                        >
                          <Plus size={13} /> {t('Create a document')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Uncategorized or Search Results Section */}
          {!needle && folders.length > 0 && docs.some(d => !d.folderId) && (
            <div className="folders-section-header" style={{ marginTop: 8 }}>
              <span>{t('Uncategorized')}</span>
            </div>
          )}

          <div
            className={`uncategorized-zone ${dragOverUncategorized ? 'drag-over' : ''}`}
            onDragOver={e => {
              e.preventDefault()
              if (!dragOverUncategorized) setDragOverUncategorized(true)
            }}
            onDragLeave={() => setDragOverUncategorized(false)}
            onDrop={async e => {
              e.preventDefault()
              setDragOverUncategorized(false)
              const docId = e.dataTransfer.getData('text/plain')
              if (docId) {
                await db.documents.update(docId, { folderId: undefined, updatedAt: new Date().toISOString() })
                await refresh(activeId)
              }
            }}
          >
            {(needle ? filtered : docs.filter(d => !d.folderId)).map(d => renderDocumentRow(d))}
            {!needle && docs.filter(d => !d.folderId).length === 0 && folders.length > 0 && (
              <div className="uncategorized-empty-drop">
                {t('Drop here to remove from folder')}
              </div>
            )}
          </div>
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

            <FullModeButton kind="focus" />
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
        <div className="editor-scroll">
          {active ? (
            <article
              className={`page ${fontFamily(active.font) ? 'has-font' : ''}`}
              style={{ '--doc-font': fontFamily(active.font) ?? undefined } as React.CSSProperties}
            >
              {/* Notion-style Breadcrumb */}
              <div className="doc-breadcrumb">
                <button
                  type="button"
                  className="breadcrumb-btn"
                  onClick={() => setMovingDocId(active.id)}
                  title={t('Move to folder')}
                >
                  <span>{activeFolder ? activeFolder.icon || '📁' : '📁'}</span>
                  <span>{activeFolder ? activeFolder.title : t('Uncategorized')}</span>
                </button>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-current">{titleOf(active.title)}</span>
              </div>

              {/* Notion Page Icon Selector */}
              <div className="page-header-row">
                <button
                  type="button"
                  className="page-icon-trigger"
                  onClick={() => setIconPickerOpen(v => !v)}
                  title={active.icon ? t('Change icon') : t('Add page icon')}
                >
                  {active.icon || '📄'}
                </button>

                {iconPickerOpen && (
                  <div className="emoji-picker-popover" onClick={e => e.stopPropagation()}>
                    <div className="emoji-picker-title">{t('Folder icon')}</div>
                    <div className="emoji-grid">
                      {DOC_EMOJIS.map(emo => (
                        <button
                          key={emo}
                          type="button"
                          className={`emoji-btn ${active.icon === emo ? 'active' : ''}`}
                          onClick={() => void updateDocIcon(emo)}
                        >
                          {emo}
                        </button>
                      ))}
                    </div>
                    {active.icon && (
                      <button
                        type="button"
                        className="emoji-remove-btn"
                        onClick={() => void updateDocIcon('📄')}
                      >
                        {t('Remove icon')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <input
                ref={titleRef}
                className="title-input"
                value={active.title}
                onChange={e => updateTitle(e.target.value)}
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

              {/* Notion Project Templates when note is empty */}
              {editor && plainText(active.content).trim() === '' && (
                <div className="templates-container">
                  <div className="templates-header">
                    <Sparkles size={14} /> {t('Use a project template')}
                  </div>
                  <div className="templates-grid">
                    <button
                      type="button"
                      className="template-card"
                      onClick={() => applyTemplate('thesis')}
                    >
                      <span className="template-icon">🎓</span>
                      <div className="template-info">
                        <strong>{t('Thesis / Project outline')}</strong>
                        <small>Mục tiêu, công nghệ & các mốc tiến độ</small>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="template-card"
                      onClick={() => applyTemplate('progress')}
                    >
                      <span className="template-icon">📋</span>
                      <div className="template-info">
                        <strong>{t('Weekly progress report')}</strong>
                        <small>Checklist việc đã làm & kế hoạch tuần</small>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="template-card"
                      onClick={() => applyTemplate('meeting')}
                    >
                      <span className="template-icon">👨‍🏫</span>
                      <div className="template-info">
                        <strong>{t('Supervisor meeting notes')}</strong>
                        <small>Báo cáo nội dung & góp ý của GVHD</small>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="template-card"
                      onClick={() => applyTemplate('blank')}
                    >
                      <span className="template-icon">📝</span>
                      <div className="template-info">
                        <strong>{t('Blank note')}</strong>
                        <small>Bắt đầu viết từ trang trắng</small>
                      </div>
                    </button>
                  </div>
                </div>
              )}

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

                  {/* Inside a table → row/column tools */}
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
              placeholder="e.g. Đồ án tốt nghiệp 2026, Nghiên cứu AI..."
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleCreateFolder()
              }}
            />
          </div>

          <div className="modal-form-group">
            <label className="modal-label">{t('Folder icon')}</label>
            <div className="modal-emoji-row">
              {FOLDER_EMOJIS.map(emo => (
                <button
                  key={emo}
                  type="button"
                  className={`emoji-btn ${newFolderIcon === emo ? 'active' : ''}`}
                  onClick={() => setNewFolderIcon(emo)}
                >
                  {emo}
                </button>
              ))}
            </div>
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
                  <small>
                    Giữ lại {docs.filter(d => d.folderId === folderToDelete.id).length} tài liệu và chuyển ra danh sách Chưa phân loại.
                  </small>
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
                  <small>
                    Xoá vĩnh viễn cả thư mục cùng tất cả {docs.filter(d => d.folderId === folderToDelete.id).length} tài liệu bên trong.
                  </small>
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

      {/* Move Document Modal */}
      {movingDocId && (
        <Modal title={t('Move to folder')} onClose={() => setMovingDocId(null)}>
          <div className="move-modal-list">
            <button
              className="button move-item"
              onClick={async () => {
                await db.documents.update(movingDocId, { folderId: undefined, updatedAt: new Date().toISOString() })
                await refresh(activeId)
                setMovingDocId(null)
              }}
            >
              <span>📁</span> {t('Uncategorized')}
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                className="button move-item"
                onClick={async () => {
                  await db.documents.update(movingDocId, { folderId: f.id, updatedAt: new Date().toISOString() })
                  setExpandedFolders(prev => new Set(prev).add(f.id))
                  await refresh(activeId)
                  setMovingDocId(null)
                }}
              >
                <span>{f.icon || '📁'}</span> {f.title}
              </button>
            ))}
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
