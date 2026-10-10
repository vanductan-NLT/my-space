'use client'

import { GoogleIcon } from './google-icon'
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
      className="icon-button full-mode-trigger"
      onClick={() => enter(kind)}
      aria-label={label}
      title={`${focus ? t('Focus mode (full screen writing)') : t('Full mode (Esc to exit)')} (Ctrl/⌘+⇧+F)`}
    >
      {focus ? <GoogleIcon name="center_focus_strong" size={18} /> : <GoogleIcon name="fullscreen" size={18} />}
    </button>
  )
}

/** A quiet, consistently placed escape hatch above every full-screen canvas. */
export function ExitFullModeButton() {
  const { t } = useI18n()
  const { active, kind, exit } = useFullMode()
  if (!active) return null

  const focus = kind === 'focus'
  const label = focus ? t('Exit focus mode') : t('Exit full mode')
  return (
    <button className="exit-full-mode-btn" onClick={exit} title={`${label} (Esc)`} aria-label={label}>
      <GoogleIcon name="fullscreen_exit" size={16} />
      <span>{focus ? t('Exit Focus') : t('Exit Full Mode')}</span>
      <kbd className="kbd-hint">Esc</kbd>
    </button>
  )
}
