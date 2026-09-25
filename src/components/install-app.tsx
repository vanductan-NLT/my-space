'use client'

import { useState } from 'react'
import { isIos, usePwaInstall } from '@/lib/use-pwa-install'
import { Modal } from './modal'

/** Browser install dialog when available, otherwise a short how-to. */
export function useInstallFlow() {
  const { canPrompt, installed, install } = usePwaInstall()
  const [guide, setGuide] = useState(false)

  const start = async () => {
    if (canPrompt && (await install()) !== null) return
    setGuide(true)
  }

  const ios = guide && isIos()
  const android = guide && /android/i.test(navigator.userAgent)

  const guideModal = guide && (
    <Modal title="Install My Space" onClose={() => setGuide(false)}>
      <ol className="install-steps">
        {ios ? (
          <>
            <li>Tap the <strong>Share</strong> button in Safari&apos;s toolbar.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>, then open My Space from the new icon.</li>
          </>
        ) : android ? (
          <>
            <li>Open Chrome&apos;s <strong>⋮</strong> menu.</li>
            <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          </>
        ) : (
          <>
            <li>In Chrome or Edge, click the install icon in the address bar, or open the browser menu.</li>
            <li>Choose <strong>Install My Space</strong>. In Safari on Mac: <strong>File → Add to Dock</strong>.</li>
          </>
        )}
      </ol>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
        It opens in its own window like an app. Your documents and boards stay in this browser either way.
      </p>
      <div className="modal-footer">
        <button type="button" className="button primary" onClick={() => setGuide(false)} data-autofocus>
          Got it
        </button>
      </div>
    </Modal>
  )

  return { installed, start, guideModal }
}
