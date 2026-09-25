/*
 * Frame: draws a screenshot on a background with padding, rounded corners, a
 * shadow and an optional window/browser frame. One renderer for the live
 * preview and the export, so what you see is what you get.
 */

export type FrameSize = 'auto' | '16:9' | '4:3' | '1:1' | '9:16' | '1.91:1'
export type FrameChrome = 'none' | 'window-light' | 'window-dark' | 'browser-light' | 'browser-dark'

export type FrameSettings = {
  size: FrameSize
  background: string // id from BACKGROUNDS
  chrome: FrameChrome
  padding: number // 0..100
  radius: number // 0..100
  shadow: number // 0..100
  scale: number // 50..100 (% of the available area)
  watermark: string // '' = off
}

export const DEFAULT_FRAME: FrameSettings = {
  size: 'auto',
  background: 'aurora',
  chrome: 'none',
  padding: 45,
  radius: 40,
  shadow: 55,
  scale: 100,
  watermark: '',
}

export type Background =
  | { id: string; kind: 'gradient'; angle: number; stops: string[] }
  | { id: string; kind: 'solid'; color: string }
  | { id: string; kind: 'blur' }
  | { id: string; kind: 'transparent' }

export const BACKGROUNDS: Background[] = [
  { id: 'aurora', kind: 'gradient', angle: 135, stops: ['#99e5b7', '#4fb3d9', '#6a5ae0'] },
  { id: 'sunset', kind: 'gradient', angle: 135, stops: ['#ffb36b', '#ff6f91', '#a44cd3'] },
  { id: 'ocean', kind: 'gradient', angle: 160, stops: ['#1c92d2', '#3ec6c1', '#c9f2e8'] },
  { id: 'peach', kind: 'gradient', angle: 120, stops: ['#ffd1a9', '#ffb3c6'] },
  { id: 'grape', kind: 'gradient', angle: 135, stops: ['#7f5af0', '#e056fd'] },
  { id: 'forest', kind: 'gradient', angle: 150, stops: ['#134e5e', '#71b280'] },
  { id: 'citrus', kind: 'gradient', angle: 135, stops: ['#f6d365', '#fda085'] },
  { id: 'night', kind: 'gradient', angle: 145, stops: ['#0f2027', '#203a43', '#2c5364'] },
  { id: 'candy', kind: 'gradient', angle: 120, stops: ['#a1c4fd', '#fbc2eb'] },
  { id: 'lime', kind: 'gradient', angle: 135, stops: ['#d4fc79', '#96e6a1'] },
  { id: 'blur', kind: 'blur' },
  { id: 'paper', kind: 'solid', color: '#f4f4f2' },
  { id: 'ink', kind: 'solid', color: '#141414' },
  { id: 'transparent', kind: 'transparent' },
]

export const SIZES: { id: FrameSize; ratio: number | null }[] = [
  { id: 'auto', ratio: null },
  { id: '16:9', ratio: 16 / 9 },
  { id: '4:3', ratio: 4 / 3 },
  { id: '1:1', ratio: 1 },
  { id: '9:16', ratio: 9 / 16 },
  { id: '1.91:1', ratio: 1.91 },
]

export type Layout = {
  width: number
  height: number
  box: { x: number; y: number; w: number; h: number } // the framed image incl. chrome
  bar: number // chrome bar height (0 = none)
  radius: number
  unit: number // a size unit relative to the image, for shadows/text
}

/** Where everything goes, in output pixels at scale 1 (image-native size). */
export function layout(imgW: number, imgH: number, s: FrameSettings): Layout {
  const bar = s.chrome === 'none' ? 0 : Math.round(Math.max(26, imgW * (s.chrome.startsWith('browser') ? 0.045 : 0.035)))
  const contentW = imgW
  const contentH = imgH + bar
  const unit = Math.max(contentW, contentH) / 100
  const pad = (s.padding / 100) * 22 * unit
  const k = s.scale / 100

  let width = contentW + 2 * pad
  let height = contentH + 2 * pad
  const ratio = SIZES.find(z => z.id === s.size)?.ratio ?? null
  if (ratio) {
    if (width / height > ratio) height = width / ratio
    else width = height * ratio
  }
  // The image may be shown smaller than the space it has (Scale).
  const w = contentW * k
  const h = contentH * k
  return {
    width: Math.round(width),
    height: Math.round(height),
    box: { x: (width - w) / 2, y: (height - h) / 2, w, h },
    bar: bar * k,
    radius: (s.radius / 100) * 4 * unit * k,
    unit: unit * k,
  }
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function paintBackground(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, bg: Background, W: number, H: number) {
  if (bg.kind === 'transparent') return
  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color
    ctx.fillRect(0, 0, W, H)
    return
  }
  if (bg.kind === 'blur') {
    // The screenshot itself, enlarged and blurred — always matches.
    const cover = Math.max(W / img.width, H / img.height) * 1.2
    ctx.save()
    ctx.filter = `blur(${Math.round(Math.max(W, H) / 22)}px) saturate(1.4)`
    ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover)
    ctx.restore()
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(0, 0, W, H)
    return
  }
  const a = (bg.angle * Math.PI) / 180
  const len = Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a))
  const cx = W / 2
  const cy = H / 2
  const dx = (Math.sin(a) * len) / 2
  const dy = (-Math.cos(a) * len) / 2
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function paintChrome(ctx: CanvasRenderingContext2D, s: FrameSettings, x: number, y: number, w: number, bar: number, unit: number) {
  const dark = s.chrome.endsWith('dark')
  ctx.fillStyle = dark ? '#26272b' : '#f1f1f3'
  ctx.fillRect(x, y, w, bar)
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  ctx.fillRect(x, y + bar - Math.max(1, unit * 0.08), w, Math.max(1, unit * 0.08))
  const r = bar * 0.14
  const gap = r * 3.1
  ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(x + bar * 0.55 + i * gap, y + bar / 2, r, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })
  if (s.chrome.startsWith('browser')) {
    const pillW = Math.min(w * 0.5, w - bar * 4)
    const pillH = bar * 0.56
    roundRect(ctx, x + (w - pillW) / 2, y + (bar - pillH) / 2, pillW, pillH, pillH / 2)
    ctx.fillStyle = dark ? '#3a3b40' : '#ffffff'
    ctx.fill()
  }
}

/**
 * Draws the framed image onto `ctx`, whose canvas must be layout.width*scale
 * by layout.height*scale.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  s: FrameSettings,
  scale = 1
) {
  const L = layout(img.width, img.height, s)
  const bg = BACKGROUNDS.find(b => b.id === s.background) ?? BACKGROUNDS[0]
  ctx.save()
  ctx.scale(scale, scale)
  ctx.clearRect(0, 0, L.width, L.height)
  paintBackground(ctx, img, bg, L.width, L.height)

  const { x, y, w, h } = L.box
  // Shadow: drawn from a filled shape under the image.
  if (s.shadow > 0) {
    ctx.save()
    ctx.shadowColor = `rgba(0,0,0,${0.12 + 0.4 * (s.shadow / 100)})`
    ctx.shadowBlur = (s.shadow / 100) * 6 * L.unit * scale
    ctx.shadowOffsetY = (s.shadow / 100) * 2 * L.unit * scale
    roundRect(ctx, x, y, w, h, L.radius)
    ctx.fillStyle = s.chrome.endsWith('dark') ? '#26272b' : '#ffffff'
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  roundRect(ctx, x, y, w, h, L.radius)
  ctx.clip()
  if (L.bar) paintChrome(ctx, s, x, y, w, L.bar, L.unit)
  ctx.drawImage(img, x, y + L.bar, w, h - L.bar)
  ctx.restore()

  if (s.watermark.trim()) {
    const size = Math.max(12, L.unit * 2.2)
    ctx.font = `600 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = bg.kind === 'solid' && bg.color === '#f4f4f2' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.85)'
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = size / 3
    ctx.fillText(s.watermark.trim(), L.width - size, L.height - size * 0.8)
  }
  ctx.restore()
  return L
}

/** Renders at a given export scale and returns the image. */
export async function exportFrame(
  img: CanvasImageSource & { width: number; height: number },
  s: FrameSettings,
  opts: { scale: number; type: 'image/png' | 'image/jpeg' }
): Promise<Blob> {
  const L = layout(img.width, img.height, s)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(L.width * opts.scale)
  canvas.height = Math.round(L.height * opts.scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  if (opts.type === 'image/jpeg' && s.background === 'transparent') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  renderFrame(ctx, img, s, opts.scale)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, opts.type, 0.92))
  if (!blob) throw new Error('export failed')
  return blob
}
