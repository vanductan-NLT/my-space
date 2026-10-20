'use client'

import { Dumbbell, ExternalLink, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useTheme } from '../theme-context'
import '../work/work.css'
import './health.css'
import { FullModeButton } from '../full-mode'

// The workout log ("Sổ tập") is its own app with its own login and Google Sheet.
// It is embedded the same way as TanFlow, plus a tiny postMessage protocol so it
// follows this app's theme and language and hides the controls that duplicate ours.
const DEFAULT_URL = 'https://so-tap-tan.vercel.app/'

/**
 * Messages from the embedded app: `ready` once its listener is attached, and `key`
 * for My Space shortcuts typed while the frame has focus (keys never reach this
 * page from inside an iframe). Only the keys the app asks for are re-dispatched.
 */
type FrameMessage =
  | { source: 'sotap'; type: 'ready' }
  | { source: 'sotap'; type: 'key'; key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

const isFrameMessage = (data: unknown): data is FrameMessage => {
  if (typeof data !== 'object' || data === null) return false
  const m = data as Record<string, unknown>
  if (m.source !== 'sotap') return false
  return m.type === 'ready' || (m.type === 'key' && typeof m.key === 'string' && m.key.length <= 2)
}

export default function HealthWorkspace() {
  const { t, lang } = useI18n()
  const { theme } = useTheme()
  const baseUrl = process.env.NEXT_PUBLIC_EXERCISE_URL || DEFAULT_URL
  const origin = useMemo(() => {
    try {
      return new URL(baseUrl).origin
    } catch {
      return '*'
    }
  }, [baseUrl])
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [key, setKey] = useState(0)

  // The first paint already uses the current theme and language. Later changes go
  // through postMessage, so switching never reloads the frame (and never loses a
  // half-typed set).
  const [src] = useState(() => {
    try {
      const u = new URL(baseUrl)
      u.searchParams.set('embed', '1')
      u.searchParams.set('theme', theme)
      u.searchParams.set('lang', lang)
      return u.toString()
    } catch {
      return baseUrl
    }
  })

  const sendPrefs = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ source: 'my-space', type: 'prefs', theme, lang }, origin)
  }, [theme, lang, origin])

  // Re-send whenever the theme or language changes, and when the frame (re)loads.
  useEffect(sendPrefs, [sendPrefs, key, state])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow || !isFrameMessage(event.data)) return
      const message = event.data
      if (message.type === 'key') {
        // Same event the shell's own shortcut handler listens for.
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: message.key,
            ctrlKey: !!message.ctrlKey,
            metaKey: !!message.metaKey,
            shiftKey: !!message.shiftKey,
            altKey: !!message.altKey,
          }),
        )
        return
      }
      sendPrefs()
      setState('ready')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, sendPrefs])

  useEffect(() => {
    const timer = setTimeout(() => setState(s => (s === 'loading' ? 'error' : s)), 12000)
    return () => clearTimeout(timer)
  }, [key])

  const reload = () => {
    setState('loading')
    setKey(v => v + 1)
  }

  return (
    <div className="work-mode health-mode">
      <header className="work-header">
        <div className="work-title">
          <span className="work-mark">
            <Dumbbell size={19} />
          </span>
          <strong>{t('Health')}</strong>
        </div>

        <div className="work-header-actions">
          <button className="icon-button" onClick={reload} title={t('Reload workspace')} aria-label={t('Reload workout log')}>
            <RefreshCw size={17} />
          </button>

          <a
            className="button"
            href={baseUrl}
            target="_blank"
            rel="noreferrer"
            title={t('Open workout log in external tab')}
            aria-label={t('Open workout log in external tab')}
          >
            <ExternalLink size={15} />
            <span>{t('Open in new tab')}</span>
          </a>
          <FullModeButton />
        </div>
      </header>

      <div className="frame-stage">
        {state === 'loading' && (
          <div className="frame-status">
            <div className="spinner" />
            <h2>{t('Opening workout log')}</h2>
          </div>
        )}

        {state === 'error' && (
          <div className="frame-status error">
            <h2>{t('Workout log could not be embedded')}</h2>
            <p>
              {t('The host may block iframes, be offline, or be taking too long. Your safest option is to open the original workspace directly.')}
            </p>
            <div>
              <a className="button primary" href={baseUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> {t('Open workout log')}
              </a>
              <button className="button" onClick={reload}>
                <RefreshCw size={15} /> {t('Try again')}
              </button>
            </div>
          </div>
        )}

        <iframe
          ref={frameRef}
          key={key}
          className={state === 'ready' ? 'ready' : ''}
          src={src}
          title="Workout log"
          // Photos are taken with the camera inside the frame; a cross-origin frame
          // can only use it when it is delegated here.
          allow="camera; fullscreen; clipboard-write; web-share"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
      </div>
    </div>
  )
}
