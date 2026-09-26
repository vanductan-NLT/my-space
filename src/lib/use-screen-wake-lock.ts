'use client'

import { useEffect } from 'react'

/**
 * Keep the display awake while My Space is open and visible. Browsers release
 * screen wake locks when a tab is hidden, so acquire it again when the user
 * returns. A user interaction also retries requests that were initially
 * blocked by the browser.
 */
export function useScreenWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let requesting = false
    let disposed = false

    const acquire = async () => {
      if (disposed || requesting || sentinel || document.visibilityState !== 'visible') return
      requesting = true
      try {
        const next = await navigator.wakeLock.request('screen')
        if (disposed || document.visibilityState !== 'visible') {
          await next.release()
          return
        }
        sentinel = next
        next.addEventListener('release', () => {
          if (sentinel === next) sentinel = null
        })
      } catch {
        // Unsupported permission/device state: retry after the next user action.
      } finally {
        requesting = false
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquire()
      } else {
        const current = sentinel
        sentinel = null
        void current?.release()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pointerdown', acquire, { capture: true })
    window.addEventListener('keydown', acquire, { capture: true })

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pointerdown', acquire, { capture: true })
      window.removeEventListener('keydown', acquire, { capture: true })
      const current = sentinel
      sentinel = null
      void current?.release()
    }
  }, [])
}
