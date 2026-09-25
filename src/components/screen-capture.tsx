'use client'

import { ScreenShare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

/*
 * "Capture screen": the browser asks which screen/window/tab to share, one
 * frame is grabbed, and a crop overlay lets you drag out the part you want.
 * Desktop only — phones don't let web pages capture the screen, so the button
 * isn't shown there.
 */

export const canCaptureScreen = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !window.matchMedia('(pointer: coarse)').matches

async function grabFrame(): Promise<ImageBitmap> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  try {
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    await video.play()
    // Give the first frame a moment to arrive.
    await new Promise(r => setTimeout(r, 250))
    return await createImageBitmap(video)
  } finally {
    stream.getTracks().forEach(track => track.stop())
  }
}

type Rect = { x: number; y: number; w: number; h: number }

function CropOverlay({ image, onDone, onCancel }: { image: ImageBitmap; onDone: (rect: Rect | null) => void; onCancel: () => void }) {
  const { t } = useI18n()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [sel, setSel] = useState<Rect | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    c.width = image.width
    c.height = image.height
    c.getContext('2d')?.drawImage(image, 0, 0)
  }, [image])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onDone(sel)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, onDone, onCancel])

  // Pointer position → image pixels.
  const toImage = (e: React.PointerEvent) => {
    const box = canvas.current!.getBoundingClientRect()
    return {
      x: Math.min(image.width, Math.max(0, ((e.clientX - box.left) / box.width) * image.width)),
      y: Math.min(image.height, Math.max(0, ((e.clientY - box.top) / box.height) * image.height)),
    }
  }

  const box = canvas.current?.getBoundingClientRect()
  const k = box ? box.width / image.width : 1
  const big = sel && sel.w > 8 && sel.h > 8

  return createPortal(
    <div className="crop-overlay" role="dialog" aria-modal="true" aria-label={t('Crop screenshot')}>
      <div className="crop-hint">{t('Drag to select the part you want · Enter to confirm · Esc to cancel')}</div>
      <div className="crop-stage">
        <div className="crop-frame">
          <canvas
            ref={canvas}
            className="crop-canvas"
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              const p = toImage(e)
              start.current = p
              setSel({ x: p.x, y: p.y, w: 0, h: 0 })
            }}
            onPointerMove={e => {
              if (!start.current) return
              const p = toImage(e)
              const s = start.current
              setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
            }}
            onPointerUp={() => (start.current = null)}
          />
          {big && (
            <div className="crop-selection" style={{ left: sel.x * k, top: sel.y * k, width: sel.w * k, height: sel.h * k }}>
              <span>
                {Math.round(sel.w)} × {Math.round(sel.h)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="crop-actions">
        <button type="button" className="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button type="button" className="button" onClick={() => onDone(null)}>
          {t('Whole screen')}
        </button>
        <button type="button" className="button primary" disabled={!big} onClick={() => onDone(sel)}>
          {t('Use selection')}
        </button>
      </div>
    </div>,
    document.body
  )
}

/** Button that captures the screen and returns the cropped image as a PNG file. */
export function CaptureScreenButton({
  onImage,
  onError,
  className = 'icon-button',
  withLabel = false,
}: {
  onImage: (file: File) => void
  onError?: (message: string) => void
  className?: string
  withLabel?: boolean
}) {
  const { t } = useI18n()
  const [supported, setSupported] = useState(false)
  const [frame, setFrame] = useState<ImageBitmap | null>(null)

  useEffect(() => setSupported(canCaptureScreen()), [])
  if (!supported) return null

  const capture = async () => {
    try {
      setFrame(await grabFrame())
    } catch (err) {
      // Cancelling the browser's picker is not an error worth showing.
      if (err instanceof DOMException && err.name === 'NotAllowedError') return
      onError?.(t('The screen could not be captured.'))
    }
  }

  const finish = async (rect: Rect | null) => {
    if (!frame) return
    const r = rect ?? { x: 0, y: 0, w: frame.width, h: frame.height }
    const c = document.createElement('canvas')
    c.width = Math.round(r.w)
    c.height = Math.round(r.h)
    c.getContext('2d')?.drawImage(frame, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height)
    frame.close()
    setFrame(null)
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'))
    if (blob) onImage(new File([blob], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: 'image/png' }))
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void capture()} title={t('Capture screen')} aria-label={t('Capture screen')}>
        <ScreenShare size={withLabel ? 15 : 18} />
        {withLabel && <span>{t('Capture screen')}</span>}
      </button>
      {frame && (
        <CropOverlay
          image={frame}
          onDone={rect => void finish(rect)}
          onCancel={() => {
            frame.close()
            setFrame(null)
          }}
        />
      )}
    </>
  )
}
