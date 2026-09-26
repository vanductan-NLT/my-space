'use client'

import { ExternalLink, RefreshCw, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import '../work/work.css'
import { FullModeButton } from '../full-mode'

const CHALLENGE_URL = 'https://www.vantoicalis.com/winter-arc'

export default function ChallengeWorkspace() {
  const { t } = useI18n()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [key, setKey] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setState(value => (value === 'loading' ? 'error' : value)), 12000)
    return () => clearTimeout(timer)
  }, [key])

  const reload = () => {
    setState('loading')
    setKey(value => value + 1)
  }

  return (
    <div className="work-mode">
      <header className="work-header">
        <div className="work-title">
          <span className="work-mark"><Trophy size={19} /></span>
          <strong>Winter Arc</strong>
        </div>
        <div className="work-header-actions">
          <FullModeButton />
          <button className="icon-button" onClick={reload} title={t('Reload challenge')} aria-label={t('Reload challenge')}>
            <RefreshCw size={17} />
          </button>
          <a className="button" href={CHALLENGE_URL} target="_blank" rel="noreferrer" title={t('Open challenge in external tab')}>
            <ExternalLink size={15} />
            <span>{t('Open in new tab')}</span>
          </a>
        </div>
      </header>

      <div className="frame-stage">
        {state === 'loading' && <div className="frame-status"><div className="spinner" /><h2>{t('Opening Winter Arc')}</h2></div>}
        {state === 'error' && (
          <div className="frame-status error">
            <h2>{t('Winter Arc could not be embedded')}</h2>
            <p>{t('The host may block iframes, be offline, or be taking too long. Your safest option is to open the original workspace directly.')}</p>
            <div>
              <a className="button primary" href={CHALLENGE_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {t('Open Winter Arc')}</a>
              <button className="button" onClick={reload}><RefreshCw size={15} /> {t('Try again')}</button>
            </div>
          </div>
        )}
        <iframe
          key={key}
          className={state === 'ready' ? 'ready' : ''}
          src={CHALLENGE_URL}
          title="Winter Arc challenge"
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
