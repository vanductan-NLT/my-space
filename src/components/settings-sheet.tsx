'use client'

import { MonitorDown } from 'lucide-react'
import { useInstallFlow } from './install-app'
import { Modal } from './modal'
import { useTheme, type ThemeChoice } from './theme-context'

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match device' },
]

/**
 * Phone settings, opened from the Settings tab: things that are not modes and
 * so don't belong in the bottom bar.
 */
export function SettingsSheet({
  open,
  onClose,
  mascotOn,
  onMascotChange,
}: {
  open: boolean
  onClose: () => void
  mascotOn: boolean
  onMascotChange: (on: boolean) => void
}) {
  const { choice, setChoice } = useTheme()
  const { installed, start, guideModal } = useInstallFlow()

  return (
    <>
      {open && (
        <Modal title="Settings" onClose={onClose} sheet>
          <section className="settings-group" aria-labelledby="settings-appearance">
            <h4 id="settings-appearance">Appearance</h4>
            <div className="segmented" role="group" aria-labelledby="settings-appearance">
              {THEMES.map(t => (
                <button key={t.value} type="button" aria-pressed={choice === t.value} onClick={() => setChoice(t.value)} data-autofocus={choice === t.value || undefined}>
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-group">
            <button type="button" className="settings-row" role="switch" aria-checked={mascotOn} onClick={() => onMascotChange(!mascotOn)}>
              <span>
                <strong>Mascot</strong>
                <small>The little friend in the corner</small>
              </span>
              <span className="switch" aria-hidden="true" />
            </button>

            {!installed && (
              <button
                type="button"
                className="settings-row"
                onClick={() => {
                  onClose()
                  void start()
                }}
              >
                <span>
                  <strong>Install app</strong>
                  <small>Open My Space from your home screen</small>
                </span>
                <MonitorDown size={18} aria-hidden="true" />
              </button>
            )}
          </section>
        </Modal>
      )}
      {guideModal}
    </>
  )
}
