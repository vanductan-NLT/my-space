'use client'

import { useState } from 'react'
import { isIos, usePwaInstall } from '@/lib/use-pwa-install'
import { Modal } from './modal'
import { rich, useI18n } from '@/lib/i18n'

/** Browser install dialog when available, otherwise a short how-to. */
export function useInstallFlow() {
  const { canPrompt, installed, install } = usePwaInstall()
  const { t } = useI18n()
  const [guide, setGuide] = useState(false)

  const start = async () => {
    if (canPrompt && (await install()) !== null) return
    setGuide(true)
  }

  const ios = guide && isIos()
  const android = guide && /android/i.test(navigator.userAgent)

  const guideModal = guide && (
    <Modal title={t('Install My Space')} onClose={() => setGuide(false)}>
      <ol className="install-steps">
        {ios ? (
          <>
            <li>{rich(t('Tap the **Share** button in Safari’s toolbar.'))}</li>
            <li>{rich(t('Choose **Add to Home Screen**.'))}</li>
            <li>{rich(t('Tap **Add**, then open My Space from the new icon.'))}</li>
          </>
        ) : android ? (
          <>
            <li>{rich(t('Open Chrome’s **⋮** menu.'))}</li>
            <li>{rich(t('Choose **Install app** or **Add to Home screen**.'))}</li>
          </>
        ) : (
          <>
            <li>{t('In Chrome or Edge, click the install icon in the address bar, or open the browser menu.')}</li>
            <li>{rich(t('Choose **Install My Space**. In Safari on Mac: **File → Add to Dock**.'))}</li>
          </>
        )}
      </ol>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
        {t('It opens in its own window like an app. Your documents and boards stay in this browser either way.')}
      </p>
      <div className="modal-footer">
        <button type="button" className="button primary" onClick={() => setGuide(false)} data-autofocus>
          {t('Got it')}
        </button>
      </div>
    </Modal>
  )

  return { installed, start, guideModal }
}
