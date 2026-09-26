'use client'

import { Focus, Maximize2, Minimize2 } from 'lucide-react'
import { createContext, useContext } from 'react'
import { useI18n } from '@/lib/i18n'

export type FullModeKind = 'full' | 'focus'

type FullModeContextValue = {
  active: boolean
  kind: FullModeKind
  enter: (kind?: FullModeKind) => void
  exit: () => void
}

export const FullModeContext = createContext<FullModeContextValue | null>(null)

export function useFullMode() {
  const value = useContext(FullModeContext)
  if (!value) throw new Error('useFullMode must be used inside AppShell')
  return value
}

/** Shared full-mode trigger used by every workspace header. */
export function FullModeButton({ kind = 'full' }: { kind?: FullModeKind }) {
  const { t } = useI18n()
  const { enter } = useFullMode()
  const focus = kind === 'focus'
  const label = focus ? t('Focus mode') : t('Full mode')

  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => enter(kind)}
      aria-label={label}
      title={focus ? t('Focus mode (full screen writing)') : t('Full mode (Esc to exit)')}
    >
      {focus ? <Focus size={18} /> : <Maximize2 size={18} />}
    </button>
  )
}

/** One consistent escape hatch, rendered above every workspace in full mode. */
export function ExitFullModeButton() {
  const { t } = useI18n()
  const { active, kind, exit } = useFullMode()
  if (!active) return null

  const focus = kind === 'focus'
  const label = focus ? t('Exit focus mode') : t('Exit full mode')
  return (
    <button className="exit-full-mode-btn" onClick={exit} title={`${label} (Esc)`} aria-label={label}>
      <Minimize2 size={16} />
      <span>{focus ? t('Exit Focus') : t('Exit Full Mode')}</span>
      <kbd className="kbd-hint">Esc</kbd>
    </button>
  )
}
