/*
 * Fonts for Write. All support Vietnamese, are self-hosted from the npm
 * packages (no Google request, works offline) and are only downloaded when a
 * document actually uses them — @font-face costs nothing until then.
 */
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/400-italic.css'
import '@fontsource/be-vietnam-pro/700.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/400-italic.css'
import '@fontsource/nunito/700.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/400-italic.css'
import '@fontsource/lora/700.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/400-italic.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/dancing-script/400.css'
import '@fontsource/dancing-script/700.css'

export type Font = { id: string; name: string; kind: string; family: string | null }

export const FONTS: Font[] = [
  { id: 'default', name: 'Default', kind: 'Clean', family: null },
  { id: 'be-vietnam', name: 'Be Vietnam Pro', kind: 'Modern', family: "'Be Vietnam Pro', system-ui, sans-serif" },
  { id: 'nunito', name: 'Nunito', kind: 'Rounded', family: "'Nunito', system-ui, sans-serif" },
  { id: 'lora', name: 'Lora', kind: 'Serif', family: "'Lora', Georgia, serif" },
  { id: 'playfair', name: 'Playfair Display', kind: 'Elegant', family: "'Playfair Display', Georgia, serif" },
  { id: 'mono', name: 'JetBrains Mono', kind: 'Mono', family: "'JetBrains Mono', ui-monospace, monospace" },
  { id: 'dancing', name: 'Dancing Script', kind: 'Handwriting', family: "'Dancing Script', cursive" },
]

export const fontFamily = (id?: string | null) => FONTS.find(f => f.id === id)?.family ?? null
