'use client'

import { Check, ExternalLink, MonitorDown, Pipette } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ACCENTS, applyAccent, isHex, readAccent, resolveAccent } from '@/lib/accent'
import { useI18n, type Lang } from '@/lib/i18n'
import { useInstallFlow } from './install-app'
import { Modal } from './modal'
import { QUOTES_EVENT, QUOTES_KEY, readQuoteSetting, type QuoteSetting } from './mascot'
import { useTheme, type ThemeChoice } from './theme-context'

export const REPO_URL = 'https://github.com/vanductan-NLT/my-space'

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match device' },
]

// Each language names itself, so it can be found whatever is selected.
const LANGS: { value: Lang; label: string }[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
]

/**
 * Settings (rail footer on desktop, Settings tab on phones): everything that
 * isn't a mode — language, appearance, mascot, install.
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
  const { choice, setChoice, theme } = useTheme()
  const { lang, setLang, t } = useI18n()
  const [accent, setAccent] = useState('mint')
  const [quotes, setQuotes] = useState<QuoteSetting>('on')
  useEffect(() => {
    setAccent(readAccent())
    setQuotes(readQuoteSetting())
  }, [open])

  const pickQuotes = (value: QuoteSetting) => {
    setQuotes(value)
    try {
      localStorage.setItem(QUOTES_KEY, value)
    } catch {}
    window.dispatchEvent(new Event(QUOTES_EVENT))
  }

  const pickAccent = (value: string) => {
    setAccent(value)
    applyAccent(value)
  }

  const { installed, start, guideModal } = useInstallFlow()

  return (
    <>
      {open && (
        <Modal title={t('Settings')} onClose={onClose} sheet>
          <section className="settings-group" aria-labelledby="settings-language">
            <h4 id="settings-language">{t('Language')}</h4>
            <div className="segmented two" role="group" aria-labelledby="settings-language">
              {LANGS.map(l => (
                <button key={l.value} type="button" lang={l.value} aria-pressed={lang === l.value} onClick={() => setLang(l.value)} data-autofocus={lang === l.value || undefined}>
                  {l.label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-group" aria-labelledby="settings-appearance">
            <h4 id="settings-appearance">{t('Appearance')}</h4>
            <div className="segmented" role="group" aria-labelledby="settings-appearance">
              {THEMES.map(th => (
                <button key={th.value} type="button" aria-pressed={choice === th.value} onClick={() => setChoice(th.value)}>
                  {t(th.label)}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-group" aria-labelledby="settings-accent">
            <h4 id="settings-accent">{t('Accent colour')}</h4>
            <div className="swatches" role="group" aria-labelledby="settings-accent">
              {ACCENTS.map(a => (
                <button
                  key={a.id}
                  type="button"
                  className="swatch"
                  style={{ background: theme === 'dark' ? a.dark : a.light }}
                  aria-label={t(a.name)}
                  title={t(a.name)}
                  aria-pressed={accent === a.id}
                  onClick={() => pickAccent(a.id)}
                >
                  {accent === a.id && <Check size={16} />}
                </button>
              ))}
              <label
                className="swatch custom"
                title={t('Any colour')}
                style={isHex(accent) ? { background: resolveAccent(accent)[theme] } : undefined}
                data-selected={isHex(accent) || undefined}
              >
                {isHex(accent) ? <Check size={16} /> : <Pipette size={16} />}
                <input
                  type="color"
                  aria-label={t('Pick any colour')}
                  value={isHex(accent) ? accent : '#99e5b7'}
                  onChange={e => pickAccent(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="settings-group">
            <button type="button" className="settings-row" role="switch" aria-checked={mascotOn} onClick={() => onMascotChange(!mascotOn)}>
              <span>
                <strong>{t('Mascot')}</strong>
                <small>{t('The little friend in the corner')}</small>
              </span>
              <span className="switch" aria-hidden="true" />
            </button>

            {mascotOn && (
              <button type="button" className="settings-row" role="switch" aria-checked={quotes === 'on'} onClick={() => pickQuotes(quotes === 'on' ? 'off' : 'on')}>
                <span>
                  <strong>{t('Encouragement from the mascot')}</strong>
                  <small>{lang === 'vi' ? 'Tiếng Việt' : 'English'}</small>
                </span>
                <span className="switch" aria-hidden="true" />
              </button>
            )}

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
                  <strong>{t('Install app')}</strong>
                  <small>{t('Open My Space from your home screen')}</small>
                </span>
                <MonitorDown size={18} aria-hidden="true" />
              </button>
            )}

            <a className="settings-row" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <span>
                <strong>{t('Open source')}</strong>
                <small>{t('Clone or contribute on GitHub')}</small>
              </span>
              <ExternalLink size={18} aria-hidden="true" />
            </a>
          </section>
        </Modal>
      )}
      {guideModal}
    </>
  )
}
