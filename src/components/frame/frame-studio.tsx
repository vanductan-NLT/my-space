'use client'

import { Copy, Download, ImagePlus, PenLine, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BACKGROUNDS, DEFAULT_FRAME, exportFrame, layout, renderFrame, SIZES, type FrameChrome, type FrameSettings } from '@/lib/frame-render'
import { sendImage, takeImage } from '@/lib/image-inbox'
import { isImageFile } from '@/lib/images'
import { useI18n } from '@/lib/i18n'
import { MenuButton } from '../menu-button'
import { CaptureScreenButton } from '../screen-capture'
import './frame.css'

/*
 * Frame mode: make a screenshot presentable — background, padding, rounded
 * corners, shadow, window/browser frame, size for social posts, watermark —
 * then copy or download it. Everything happens in the browser.
 */

const SETTINGS_KEY = 'my-space:frame'
const CHROMES: FrameChrome[] = ['none', 'window-light', 'window-dark', 'browser-light', 'browser-dark']

// The last image survives switching modes (module memory, never stored).
let lastImage: ImageBitmap | null = null

const cssBackground = (id: string) => {
  const bg = BACKGROUNDS.find(b => b.id === id)
  if (!bg) return undefined
  if (bg.kind === 'gradient') return `linear-gradient(${bg.angle}deg, ${bg.stops.join(', ')})`
  if (bg.kind === 'solid') return bg.color
  if (bg.kind === 'blur') return 'radial-gradient(circle at 30% 30%, #9ad8ff, #c9a7ff 55%, #ffc2a8)'
  return 'repeating-conic-gradient(#cfcfcf 0 25%, #fff 0 50%) 0 0 / 10px 10px'
}

export default function FrameStudio() {
  const { t } = useI18n()
  const router = useRouter()
  const [image, setImage] = useState<ImageBitmap | null>(lastImage)
  const [s, setS] = useState<FrameSettings>(DEFAULT_FRAME)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Remembered settings.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
      if (saved) setS({ ...DEFAULT_FRAME, ...saved })
    } catch {}
  }, [])
  const update = (patch: Partial<FrameSettings>) =>
    setS(prev => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })

  useEffect(() => {
    if (!notice || notice.error) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const load = useCallback(
    async (blob: Blob) => {
      try {
        const bitmap = await createImageBitmap(blob)
        lastImage = bitmap
        setImage(bitmap)
      } catch {
        setNotice({ text: t('That image could not be opened.'), error: true })
      }
    },
    [t]
  )

  // An image handed over from Create ("Frame it").
  useEffect(() => {
    const incoming = takeImage('frame')
    if (incoming) void load(incoming)
  }, [load])

  // Paste anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find(isImageFile)
      if (!file) return
      e.preventDefault()
      void load(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [load])

  // Live preview, drawn at a size that fits the screen.
  useEffect(() => {
    const c = canvas.current
    if (!c || !image) return
    const frame = requestAnimationFrame(() => {
      const L = layout(image.width, image.height, s)
      const scale = Math.min(1, 1800 / Math.max(L.width, L.height))
      c.width = Math.round(L.width * scale)
      c.height = Math.round(L.height * scale)
      const ctx = c.getContext('2d')
      if (ctx) renderFrame(ctx, image, s, scale)
    })
    return () => cancelAnimationFrame(frame)
  }, [image, s])

  const render = (type: 'image/png' | 'image/jpeg', scale: number) => {
    if (!image) throw new Error('no image')
    return exportFrame(image, s, { type, scale })
  }

  const copy = () => {
    if (!image) return
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return void download('image/png', 1)
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': render('image/png', 1) })])
      .then(() => setNotice({ text: t('Copied — paste it anywhere.') }))
      .catch(() => void download('image/png', 1))
  }

  const download = async (type: 'image/png' | 'image/jpeg', scale: number) => {
    try {
      const blob = await render(type, scale)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `frame-${new Date().toISOString().slice(0, 10)}${scale > 1 ? `@${scale}x` : ''}.${type === 'image/png' ? 'png' : 'jpg'}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      setNotice({ text: t('The image could not be created.'), error: true })
    }
  }

  const annotate = async () => {
    try {
      sendImage('create', await render('image/png', 1))
      router.push('/create')
    } catch {
      setNotice({ text: t('The image could not be created.'), error: true })
    }
  }

  const clear = () => {
    lastImage?.close()
    lastImage = null
    setImage(null)
  }

  const slider = (key: 'padding' | 'radius' | 'shadow' | 'scale', label: string, min = 0) => (
    <label className="frame-slider">
      <span>
        {t(label)} <output>{s[key]}</output>
      </span>
      <input type="range" min={min} max={100} value={s[key]} onChange={e => update({ [key]: Number(e.target.value) })} />
    </label>
  )

  return (
    <div className="frame-studio">
      <header className="frame-header">
        <strong>{t('Frame')}</strong>
        <div className="frame-header-actions">
          <CaptureScreenButton onImage={file => void load(file)} onError={text => setNotice({ text, error: true })} />
          <button type="button" className="icon-button" onClick={() => fileRef.current?.click()} title={t('Choose image')} aria-label={t('Choose image')}>
            <ImagePlus size={18} />
          </button>
          {image && (
            <>
              <button type="button" className="icon-button" onClick={() => void annotate()} title={t('Annotate in Create')} aria-label={t('Annotate in Create')}>
                <PenLine size={18} />
              </button>
              <button type="button" className="icon-button" onClick={clear} title={t('Remove image')} aria-label={t('Remove image')}>
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void load(file)
            e.target.value = ''
          }}
        />
      </header>

      <div className="frame-body">
        <div
          className={`frame-stage ${dragOver ? 'drag-over' : ''} ${s.background === 'transparent' ? 'checker' : ''}`}
          onDragOver={e => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            const file = [...e.dataTransfer.files].find(isImageFile)
            if (file) void load(file)
          }}
        >
          {image ? (
            <canvas ref={canvas} className="frame-preview" aria-label={t('Preview')} />
          ) : (
            <div className="frame-empty">
              <ImagePlus size={30} />
              <h2>{t('Make a screenshot look good')}</h2>
              <p>{t('Paste (Ctrl+V), drop an image here, or choose one.')}</p>
              <div className="frame-empty-actions">
                <button type="button" className="button primary" onClick={() => fileRef.current?.click()}>
                  {t('Choose image')}
                </button>
                <CaptureScreenButton className="button" withLabel onImage={file => void load(file)} onError={text => setNotice({ text, error: true })} />
              </div>
            </div>
          )}
        </div>

        <aside className="frame-panel" aria-label={t('Frame settings')}>
          <section>
            <h4>{t('Size')}</h4>
            <div className="chips">
              {SIZES.map(z => (
                <button key={z.id} type="button" aria-pressed={s.size === z.id} onClick={() => update({ size: z.id })}>
                  {z.id === 'auto' ? t('Auto') : z.id}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h4>{t('Background')}</h4>
            <div className="bg-swatches">
              {BACKGROUNDS.map(b => (
                <button
                  key={b.id}
                  type="button"
                  className={`bg-swatch ${b.kind}`}
                  style={{ background: cssBackground(b.id) }}
                  aria-pressed={s.background === b.id}
                  aria-label={b.kind === 'blur' ? t('Blurred image') : b.kind === 'transparent' ? t('Transparent') : b.id}
                  title={b.kind === 'blur' ? t('Blurred image') : b.kind === 'transparent' ? t('Transparent') : undefined}
                  onClick={() => update({ background: b.id })}
                />
              ))}
            </div>
          </section>

          <section>
            <h4>{t('Frame style')}</h4>
            <div className="chrome-options">
              {CHROMES.map(c => (
                <button key={c} type="button" className={`chrome-option ${c}`} aria-pressed={s.chrome === c} onClick={() => update({ chrome: c })} title={t(c)} aria-label={t(c)}>
                  <span />
                </button>
              ))}
            </div>
          </section>

          <section className="sliders">
            {slider('padding', 'Padding')}
            {slider('radius', 'Roundness')}
            {slider('shadow', 'Shadow')}
            {slider('scale', 'Image size', 50)}
          </section>

          <section>
            <h4>{t('Watermark')}</h4>
            <input className="input" value={s.watermark} maxLength={60} placeholder={t('Optional text, e.g. your name')} onChange={e => update({ watermark: e.target.value })} />
          </section>

          <div className="frame-export">
            <button type="button" className="button primary" disabled={!image} onClick={copy}>
              <Copy size={15} /> {t('Copy image')}
            </button>
            {image ? (
              <MenuButton
                label={t('Download')}
                icon={<Download size={15} />}
                items={[
                  { label: 'PNG', hint: t('original size'), onSelect: () => void download('image/png', 1) },
                  { label: 'PNG 2×', hint: t('extra sharp'), onSelect: () => void download('image/png', 2) },
                  { label: 'JPG', hint: t('smaller file'), onSelect: () => void download('image/jpeg', 1) },
                ]}
              />
            ) : (
              <button type="button" className="button" disabled>
                <Download size={15} /> {t('Download')}
              </button>
            )}
          </div>
        </aside>
      </div>

      {notice && (
        <div className={`toast ${notice.error ? 'error' : ''}`} role="status" onClick={() => setNotice(null)}>
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  )
}
