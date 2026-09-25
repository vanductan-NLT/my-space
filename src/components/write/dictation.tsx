'use client'

import type { Editor } from '@tiptap/react'
import { Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { detectLang, useI18n } from '@/lib/i18n'

/*
 * Voice → text using the browser's own speech recognition (Chrome, Edge,
 * Safari). No library. Note: the browser's speech service does the converting,
 * which in Chrome/Edge means the audio goes to Google/Microsoft — the button
 * says so. Firefox has no support, so the button isn't shown there.
 */

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

type Lang = 'vi-VN' | 'en-US'
const LANG_KEY = 'my-space:dictation-lang'

const getRecognition = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function Dictation({ editor, onError }: { editor: Editor | null; onError: (message: string) => void }) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [lang, setLang] = useState<Lang>('en-US')
  const rec = useRef<Recognition | null>(null)
  const wanted = useRef(false)
  const { t } = useI18n()

  useEffect(() => {
    setSupported(!!getRecognition())
    let saved: string | null = null
    try {
      saved = localStorage.getItem(LANG_KEY)
    } catch {}
    // Defaults to the interface language until switched here.
    setLang(saved === 'vi-VN' || saved === 'en-US' ? saved : detectLang() === 'vi' ? 'vi-VN' : 'en-US')
  }, [])

  const stop = () => {
    wanted.current = false
    rec.current?.stop()
    setListening(false)
    setInterim('')
  }

  const start = (language: Lang = lang) => {
    const SR = getRecognition()
    if (!SR || !editor) return
    rec.current?.abort()
    const r = new SR()
    r.lang = language
    r.continuous = true
    r.interimResults = true
    r.onresult = e => {
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          const clean = text.trim()
          if (clean) editor.chain().insertContent(clean + ' ').run()
        } else pending += text
      }
      setInterim(pending)
    }
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      wanted.current = false
      setListening(false)
      onError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? t('Microphone access is blocked. Allow it in the browser’s site settings to dictate.')
          : t('Voice typing stopped: the speech service is unavailable right now.')
      )
    }
    // Browsers end a session after a pause; keep going until the user stops.
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start()
        } catch {
          setListening(false)
        }
      } else setListening(false)
    }
    rec.current = r
    wanted.current = true
    try {
      r.start()
      setListening(true)
    } catch {
      onError(t('Voice typing could not start.'))
    }
  }

  const switchLang = () => {
    const next: Lang = lang === 'vi-VN' ? 'en-US' : 'vi-VN'
    setLang(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {}
    if (listening) start(next)
  }

  useEffect(() => () => {
    wanted.current = false
    rec.current?.abort()
  }, [])

  if (!supported) return null

  return (
    <>
      <button
        type="button"
        className={`icon-button ${listening ? 'dictating' : ''}`}
        onClick={() => (listening ? stop() : start())}
        aria-pressed={listening}
        aria-label={t(listening ? 'Stop voice typing' : 'Voice typing')}
        title={t("Voice typing — your browser's speech service turns speech into text (online)")}
      >
        <Mic size={18} />
      </button>

      {listening &&
        createPortal(
          <div className="dictation-bar" role="status">
            <span className="rec-dot" aria-hidden="true" />
            <span className="dictation-text">{interim || t('Listening…')}</span>
            <button type="button" className="dictation-lang" onClick={switchLang} title={t('Switch language')}>
              {lang === 'vi-VN' ? 'VI' : 'EN'}
            </button>
            <button type="button" className="dictation-stop" onClick={stop} aria-label={t('Stop voice typing')}>
              <Square size={12} fill="currentColor" /> {t('Stop')}
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
