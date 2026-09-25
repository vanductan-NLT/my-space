'use client'

import { ExternalLink, RefreshCw, TimerReset } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import './work.css'

const DEFAULT_URL = 'https://tanflow.vercel.app/'

export default function WorkWorkspace() {
  const { t } = useI18n()
  const url = process.env.NEXT_PUBLIC_TANFLOW_URL || DEFAULT_URL
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [key, setKey] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setState(s => (s === 'loading' ? 'error' : s)), 12000)
    return () => clearTimeout(timer)
  }, [key])

  const reload = () => {
    setState('loading')
    setKey(v => v + 1)
  }

  return (
    <div className="work-mode">
      <header className="work-header">
        <div className="work-title">
          <span className="work-mark">
            <TimerReset size={19} />
          </span>
          <strong>TanFlow</strong>
        </div>

        <div className="work-header-actions">
          <button
            className="icon-button"
            onClick={reload}
            title={t('Reload workspace')}
            aria-label={t('Reload TanFlow')}
          >
            <RefreshCw size={17} />
          </button>

          <a
            className="button"
            href={url}
            target="_blank"
            rel="noreferrer"
            title={t('Open TanFlow in external tab')}
          >
            <ExternalLink size={15} />
            <span>{t('Open in new tab')}</span>
          </a>
        </div>
      </header>

      <div className="frame-stage">
        {state === 'loading' && (
          <div className="frame-status">
            <div className="spinner" />
            <h2>{t('Opening TanFlow')}</h2>
          </div>
        )}

        {state === 'error' && (
          <div className="frame-status error">
            <h2>{t('TanFlow could not be embedded')}</h2>
            <p>
              {t('The host may block iframes, be offline, or be taking too long. Your safest option is to open the original workspace directly.')}
            </p>
            <div>
              <a className="button primary" href={url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> {t('Open TanFlow')}
              </a>
              <button className="button" onClick={reload}>
                <RefreshCw size={15} /> {t('Try again')}
              </button>
            </div>
          </div>
        )}

        <iframe
          key={key}
          className={state === 'ready' ? 'ready' : ''}
          src={url}
          title="TanFlow work workspace"
          // TanFlow's music is a YouTube player nested inside it; unless autoplay and
          // encrypted-media are delegated here, its play buttons silently do nothing.
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share"
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
      </div>
    </div>
  )
}
