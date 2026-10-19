'use client'

import type { Editor } from '@tiptap/react'
import { GoogleIcon } from '../google-icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { detectLang, useI18n } from '@/lib/i18n'
import { getSpeechRecognition, LiveSpeechTranscriber, supportsTrackInput } from '@/lib/live-speech-transcriber'
import { captureMeetingAudio, type MeetingAudio } from '@/lib/meeting-audio-capture'
import { formatElapsed } from '@/lib/transcript-format'
import { getLiveTranscript, liveTranscriptKey } from './live-transcript-preview'
import { addVoiceText, beginVoiceTranscript } from './voice-transcript-insert'

/*
 * Voice typing as a Notion-style live transcript. The words being spoken show
 * in grey right where they will go; as the browser finalises them they become
 * real text, in paragraphs that start with the elapsed time ("01:35"). It runs
 * until stopped (no time limit). "+ Meeting audio" mixes in a shared Zoom or
 * Google Meet sound so other people's voices are written too.
 *
 * The browser's speech service does the converting — in Chrome/Edge the audio
 * goes to Google/Microsoft; the button says so. No support in Firefox.
 */

type Lang = 'vi-VN' | 'en-US'
const LANG_KEY = 'my-space:dictation-lang'
const STAMPS_KEY = 'my-space:dictation-stamps'
/** A new time-stamped paragraph starts after this long, or after a pause. */
const PARAGRAPH_MS = 30_000
const PAUSE_MS = 8_000
/** Words Chrome keeps "interim" longer than this are written down anyway. */
const MAX_INTERIM_MS = 12_000

const canShareMeetingAudio = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !window.matchMedia('(pointer: coarse)').matches

export function Dictation({ editor, onError }: { editor: Editor | null; onError: (message: string) => void }) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [lang, setLang] = useState<Lang>('en-US')
  const [stamps, setStamps] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [meetingAudio, setMeetingAudio] = useState(false)
  const [sharing, setSharing] = useState(false)
  const { t } = useI18n()

  const transcriber = useRef<LiveSpeechTranscriber | null>(null)
  const audio = useRef<MeetingAudio | null>(null)
  /**
   * startedAt: session start (stamps are relative to it). paragraphAt: when the
   * current paragraph began. heardAt: last time any speech was recognised.
   * breakAt: set when speech resumes after a pause; the next words open a new
   * paragraph stamped with that moment. hasWords: the current paragraph has text.
   */
  const timing = useRef({ startedAt: 0, paragraphAt: 0, heardAt: 0, breakAt: null as number | null, hasWords: false })
  const settings = useRef({ lang, stamps })
  settings.current = { lang, stamps }

  useEffect(() => {
    setSupported(!!getSpeechRecognition())
    try {
      const saved = localStorage.getItem(LANG_KEY)
      // Defaults to the interface language until switched here.
      setLang(saved === 'vi-VN' || saved === 'en-US' ? saved : detectLang() === 'vi' ? 'vi-VN' : 'en-US')
      setStamps(localStorage.getItem(STAMPS_KEY) !== 'off')
    } catch {
      setLang(detectLang() === 'vi' ? 'vi-VN' : 'en-US')
    }
  }, [])

  const setPreview = useCallback(
    (meta: { anchor?: number | null; text?: string; listening?: boolean }) => {
      if (!editor || editor.isDestroyed) return
      editor.view.dispatch(editor.state.tr.setMeta(liveTranscriptKey, meta).setMeta('addToHistory', false))
    },
    [editor]
  )

  /** Writes finalised words at the anchor, opening a new time-stamped paragraph when due. */
  const commit = useCallback(
    (text: string) => {
      if (!editor || editor.isDestroyed) return
      const now = Date.now()
      const clock = timing.current
      if (clock.breakAt === null && now - clock.heardAt >= PAUSE_MS) clock.breakAt = now
      const paragraphStart = clock.breakAt ?? now
      const newParagraph = clock.hasWords && (clock.breakAt !== null || (settings.current.stamps && now - clock.paragraphAt >= PARAGRAPH_MS))
      const stamp = settings.current.stamps ? formatElapsed(paragraphStart - clock.startedAt) : null
      let anchor = getLiveTranscript(editor.state).anchor
      let result = anchor === null ? null : addVoiceText(editor.state, anchor, text, { newParagraph, stamp })
      if (!result) {
        // The spot was deleted meanwhile: continue at the end of the page.
        const end = editor.state.doc.content.size
        editor.commands.setTextSelection(end)
        const begun = beginVoiceTranscript(editor.state, stamp)
        editor.view.dispatch(begun.tr)
        anchor = begun.anchor
        result = addVoiceText(editor.state, anchor, text, { newParagraph: false, stamp: null })
      }
      if (!result) return
      editor.view.dispatch(result.tr.setMeta(liveTranscriptKey, { anchor: result.anchor, text: '' }))
      if (newParagraph) clock.paragraphAt = paragraphStart
      clock.breakAt = null
      clock.heardAt = now
      clock.hasWords = true
    },
    [editor]
  )

  /** (Re)starts recognition on the given audio track, or on the default microphone. */
  const listen = useCallback(
    (track?: MediaStreamTrack) => {
      const SR = getSpeechRecognition()
      if (!SR) return
      transcriber.current?.stop({ flush: true })
      const next = new LiveSpeechTranscriber({
        SR,
        lang: settings.current.lang,
        track,
        maxInterimMs: MAX_INTERIM_MS,
        onFinal: commit,
        onInterim: text => {
          if (text) {
            const clock = timing.current
            const now = Date.now()
            // Speech resuming after a pause starts a new paragraph at this moment.
            if (clock.breakAt === null && clock.hasWords && now - clock.heardAt >= PAUSE_MS) clock.breakAt = now
            clock.heardAt = now
          }
          setPreview({ text })
        },
        onFatal: error => {
          stopRef.current()
          onError(
            error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture'
              ? t('Microphone access is blocked. Allow it in the browser’s site settings to dictate.')
              : t('Voice typing stopped: the speech service is unavailable right now.')
          )
        },
      })
      transcriber.current = next
      next.start()
    },
    [commit, setPreview, onError, t]
  )

  const stop = useCallback(() => {
    transcriber.current?.stop({ flush: true })
    transcriber.current = null
    audio.current?.stop()
    audio.current = null
    setMeetingAudio(false)
    setListening(false)
    setPreview({ anchor: null, text: '', listening: false })
  }, [setPreview])
  const stopRef = useRef(stop)
  stopRef.current = stop

  const start = () => {
    if (!editor || !getSpeechRecognition()) return
    const now = Date.now()
    timing.current = { startedAt: now, paragraphAt: now, heardAt: now, breakAt: null, hasWords: false }
    const { tr, anchor } = beginVoiceTranscript(editor.state, settings.current.stamps ? formatElapsed(0) : null)
    editor.view.dispatch(tr.setMeta(liveTranscriptKey, { anchor, text: '', listening: true }))
    setElapsed(0)
    setListening(true)
    listen()
  }

  /** Mixes the microphone with a shared Zoom / Meet sound and listens to both. */
  const addMeetingAudio = async () => {
    const SR = getSpeechRecognition()
    if (!SR || sharing) return
    setSharing(true)
    try {
      const mixed = await captureMeetingAudio({ mic: true, meeting: true })
      if (!supportsTrackInput(SR)) {
        mixed.stop()
        onError(t('This browser can only transcribe the microphone. Update Chrome or Edge to add meeting audio.'))
        return
      }
      audio.current?.stop()
      audio.current = mixed
      mixed.onMeetingAudioEnded(() => {
        setMeetingAudio(false)
        onError(t('Meeting audio sharing stopped. Still listening to the microphone.'))
      })
      listen(mixed.track)
      setMeetingAudio(true)
    } catch (err) {
      onError(err instanceof Error ? t(err.message) : t('Meeting audio could not be shared.'))
    } finally {
      setSharing(false)
    }
  }

  const switchLang = () => {
    const next: Lang = lang === 'vi-VN' ? 'en-US' : 'vi-VN'
    setLang(next)
    settings.current = { ...settings.current, lang: next }
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {}
    if (listening) listen(audio.current?.track)
  }

  const toggleStamps = () => {
    const next = !stamps
    setStamps(next)
    settings.current = { ...settings.current, stamps: next }
    try {
      localStorage.setItem(STAMPS_KEY, next ? 'on' : 'off')
    } catch {}
  }

  // Elapsed time on the bar.
  useEffect(() => {
    if (!listening) return
    const id = setInterval(() => setElapsed(Date.now() - timing.current.startedAt), 1000)
    return () => clearInterval(id)
  }, [listening])

  // Closing the tab would end the transcript; ask first.
  useEffect(() => {
    if (!listening) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [listening])

  // Opening another page (a new editor) or leaving Write ends the session.
  useEffect(() => () => stopRef.current(), [editor])

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
        <GoogleIcon name="mic" size={18} />
      </button>

      {listening &&
        createPortal(
          <div className="dictation-bar" role="status">
            <span className="rec-dot" aria-hidden="true" />
            <span className="dictation-time">{formatElapsed(elapsed)}</span>
            <span className="dictation-text">{meetingAudio ? t('Mic + meeting audio') : t('Listening…')}</span>
            <button type="button" className="dictation-lang" onClick={switchLang} title={t('Switch language')}>
              {lang === 'vi-VN' ? 'VI' : 'EN'}
            </button>
            <button
              type="button"
              className={`dictation-lang ${stamps ? 'on' : ''}`}
              onClick={toggleStamps}
              aria-pressed={stamps}
              title={t('Time stamps')}
              aria-label={t('Time stamps')}
            >
              <GoogleIcon name="schedule" size={15} />
            </button>
            {canShareMeetingAudio() && !meetingAudio && (
              <button type="button" className="dictation-lang" onClick={() => void addMeetingAudio()} disabled={sharing} title={t('Also transcribe Zoom or Google Meet: share the Meet tab with “Share tab audio”, or the entire screen with “Share system audio” for the Zoom app.')}>
                <GoogleIcon name="add" size={15} /> <span className="dictation-label">{t('Meeting audio')}</span>
              </button>
            )}
            <button type="button" className="dictation-stop" onClick={stop} aria-label={t('Stop voice typing')}>
              <GoogleIcon name="stop" size={14} fill /> <span className="dictation-label">{t('Stop')}</span>
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
