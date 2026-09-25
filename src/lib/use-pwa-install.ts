'use client'

import { useCallback, useEffect, useState } from 'react'

// Same flow as N-Edu Learn: use the browser's install dialog when it offers
// one (Chrome/Edge/Android), otherwise show instructions (iPhone/iPad, others).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type PwaWindow = Window & { __pwaInstallPrompt?: BeforeInstallPromptEvent | null }

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function isIos() {
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || touchMac
}

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  // Start as "installed" so nothing flashes before the first check runs.
  const [installed, setInstalled] = useState(true)

  useEffect(() => {
    const w = window as PwaWindow
    const query = window.matchMedia('(display-mode: standalone)')
    const sync = () => setInstalled(isStandalone())
    // The layout script catches the event if it fired before React mounted.
    const ready = () => setPrompt(w.__pwaInstallPrompt ?? null)
    const onPrompt = (event: Event) => {
      event.preventDefault()
      w.__pwaInstallPrompt = event as BeforeInstallPromptEvent
      ready()
    }
    const onInstalled = () => {
      w.__pwaInstallPrompt = null
      setPrompt(null)
      setInstalled(true)
    }
    sync()
    ready()
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('pwainstallready', ready)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('pageshow', sync)
    query.addEventListener('change', sync)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('pwainstallready', ready)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('pageshow', sync)
      query.removeEventListener('change', sync)
    }
  }, [])

  const install = useCallback(async () => {
    if (!prompt) return null
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    ;(window as PwaWindow).__pwaInstallPrompt = null
    setPrompt(null)
    if (outcome === 'accepted') setInstalled(true)
    return outcome
  }, [prompt])

  return { canPrompt: prompt !== null, installed, install }
}
