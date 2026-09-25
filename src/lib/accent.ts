/*
 * Accent colour: the one colour the whole app (buttons, active states, links,
 * the mascot, tldraw's accent) is drawn with. Presets have a shade tuned for
 * each theme; a custom colour is lightened/darkened per theme so text on it
 * stays readable. The generated CSS is also cached so the boot script can
 * apply it before first paint.
 */

export type Accent = { id: string; name: string; dark: string; light: string }

export const ACCENTS: Accent[] = [
  { id: 'mint', name: 'Mint', dark: '#99e5b7', light: '#149a5b' },
  { id: 'sky', name: 'Sky', dark: '#8ecbff', light: '#1f74cc' },
  { id: 'lavender', name: 'Lavender', dark: '#c3b1ff', light: '#6a46dc' },
  { id: 'rose', name: 'Rose', dark: '#ffa8c5', light: '#d0306a' },
  { id: 'peach', name: 'Peach', dark: '#ffbe8f', light: '#c95a14' },
  { id: 'lemon', name: 'Lemon', dark: '#f1dc74', light: '#957500' },
  { id: 'teal', name: 'Teal', dark: '#7fe0d8', light: '#0d8a81' },
  { id: 'graphite', name: 'Graphite', dark: '#d9d9d9', light: '#3f3f46' },
]

export const ACCENT_KEY = 'my-space:accent'
export const ACCENT_CSS_KEY = 'my-space:accent-css'
export const DEFAULT_ACCENT = 'mint'

type RGB = [number, number, number]

const toRgb = (hex: string): RGB => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB
}
const toHex = (rgb: RGB) => '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
const mix = (rgb: RGB, target: number, amount: number): RGB => rgb.map(v => v + (target - v) * amount) as RGB

/** WCAG relative luminance, 0 (black) … 1 (white). */
export const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Nudges a colour until it has the wanted lightness for a theme. */
const fit = (hex: string, want: 'bright' | 'deep') => {
  let rgb = toRgb(hex)
  for (let i = 0; i < 12; i++) {
    const l = luminance(toHex(rgb))
    if (want === 'bright' ? l >= 0.4 : l <= 0.2) break
    rgb = mix(rgb, want === 'bright' ? 255 : 0, 0.15)
  }
  return toHex(rgb)
}

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)

export function resolveAccent(choice: string): { dark: string; light: string } {
  const preset = ACCENTS.find(a => a.id === choice)
  if (preset) return preset
  if (isHex(choice)) return { dark: fit(choice, 'bright'), light: fit(choice, 'deep') }
  return ACCENTS[0]
}

const vars = (color: string) => {
  const [r, g, b] = toRgb(color)
  const onColor = luminance(color) > 0.45 ? '#0d1711' : '#ffffff'
  return [
    `--mint:${color}`,
    `--mint-strong:${color}`,
    `--mint-soft:rgba(${r},${g},${b},0.13)`,
    `--mint-border:rgba(${r},${g},${b},0.26)`,
    `--mint-contrast:${onColor}`,
    `--gradient-glow:rgba(${r},${g},${b},0.06)`,
  ].join(';')
}

/** CSS overriding the accent variables for both themes (empty for the default). */
export function accentCss(choice: string): string {
  if (choice === DEFAULT_ACCENT) return ''
  const { dark, light } = resolveAccent(choice)
  return `:root[data-theme="dark"],:root:not([data-theme]){${vars(dark)}}:root[data-theme="light"]{${vars(light)}}`
}

export function readAccent(): string {
  try {
    return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

export function applyAccent(choice: string) {
  const css = accentCss(choice)
  let tag = document.getElementById('accent-style')
  if (!tag) {
    tag = document.createElement('style')
    tag.id = 'accent-style'
    document.head.appendChild(tag)
  }
  tag.textContent = css
  try {
    localStorage.setItem(ACCENT_KEY, choice)
    localStorage.setItem(ACCENT_CSS_KEY, css)
  } catch {}
}
