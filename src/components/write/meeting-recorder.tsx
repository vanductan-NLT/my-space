'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { GoogleIcon } from '../google-icon'
import { Modal } from '../modal'
import { useI18n } from '@/lib/i18n'
import { meetingSession, type MeetingSnapshot } from '@/lib/meeting-session'
import { recordingBlob, recordingsForDoc } from '@/lib/meeting-recording-store'
import { formatElapsed } from '@/lib/transcript-format'
import type { LocalRecording } from '@/lib/models'
import './meeting-recorder.css'

/*
 * Meeting transcription UI for Write: a setup dialog (language, audio sources,
 * keep the audio file) and a floating bar while recording (time, live text,
 * pause/resume, stop). The recording itself lives in lib/meeting-session.
 */

const SETTINGS_KEY = 'my-space:meeting-settings'
type Settings = { lang: 'vi-VN' | 'en-US'; mic: boolean; meeting: boolean; saveAudio: boolean }

const readSettings = (fallbackLang: Settings['lang']): Settings => {
  const defaults: Settings = { lang: fallbackLang, mic: true, meeting: true, saveAudio: true }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

export const useMeetingSnapshot = (): MeetingSnapshot => useSyncExternalStore(meetingSession.subscribe, meetingSession.getSnapshot, meetingSession.getSnapshot)

/** Screen-audio capture only exists on desktop Chrome/Edge/Firefox. */
const canShareMeetingAudio = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !window.matchMedia('(pointer: coarse)').matches

export function MeetingSetupDialog({ onStart, onClose }: { onStart: (s: Settings) => void; onClose: () => void }) {
  const { t, lang } = useI18n()
  const [settings, setSettings] = useState<Settings>(() => readSettings(lang === 'vi' ? 'vi-VN' : 'en-US'))
  const shareable = canShareMeetingAudio()
  const effective = { ...settings, meeting: shareable && settings.meeting }
  const update = (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch }))

  const start = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Settings are a convenience only.
    }
    onStart(effective)
  }

  return (
    <Modal title={t('Record a meeting')} onClose={onClose}>
      <p className="meeting-intro">{t('Transcribes the whole meeting into a new page, with no time limit. Keep this tab open until you stop.')}</p>

      <div className="meeting-field">
        <span className="modal-label">{t('Spoken language')}</span>
        <div className="meeting-segment" role="radiogroup" aria-label={t('Spoken language')}>
          {(['vi-VN', 'en-US'] as const).map(code => (
            <button key={code} type="button" role="radio" aria-checked={settings.lang === code} className={settings.lang === code ? 'on' : ''} onClick={() => update({ lang: code })}>
              {code === 'vi-VN' ? 'Tiếng Việt' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="meeting-field">
        <span className="modal-label">{t('Listen to')}</span>
        <label className="meeting-check">
          <input type="checkbox" checked={settings.mic} onChange={e => update({ mic: e.target.checked })} />
          <span>
            <strong>{t('My microphone')}</strong>
            <small>{t('Your voice, or everyone in the room for in-person meetings.')}</small>
          </span>
        </label>
        <label className={`meeting-check ${shareable ? '' : 'disabled'}`}>
          <input type="checkbox" checked={effective.meeting} disabled={!shareable} onChange={e => update({ meeting: e.target.checked })} />
          <span>
            <strong>{t('Meeting audio (Zoom, Google Meet)')}</strong>
            <small>{shareable ? t('Other people’s voices, even when you wear headphones.') : t('Needs Chrome or Edge on a computer.')}</small>
          </span>
        </label>
        {effective.meeting && (
          <div className="meeting-tips">
            <div>
              <GoogleIcon name="videocam" size={16} />
              <span>{t('Google Meet in the browser: pick the Meet tab and turn on “Share tab audio”.')}</span>
            </div>
            <div>
              <GoogleIcon name="desktop_windows" size={16} />
              <span>{t('Zoom app: pick “Entire screen” and turn on “Share system audio”.')}</span>
            </div>
          </div>
        )}
      </div>

      <label className="meeting-check">
        <input type="checkbox" checked={settings.saveAudio} onChange={e => update({ saveAudio: e.target.checked })} />
        <span>
          <strong>{t('Also keep the audio file')}</strong>
          <small>{t('About 15 MB per hour, stored in this browser. Download it from the page menu.')}</small>
        </span>
      </label>

      <p className="meeting-privacy">
        <GoogleIcon name="info" size={15} />
        {t('Speech is converted by your browser’s speech service (Google in Chrome, Microsoft in Edge), not by AI here. Audio files never leave this browser.')}
      </p>

      <div className="modal-footer">
        <button type="button" className="button" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button type="button" className="button primary" disabled={!effective.mic && !effective.meeting} onClick={start}>
          <GoogleIcon name="fiber_manual_record" size={16} /> {t('Start recording')}
        </button>
      </div>
    </Modal>
  )
}

/** Floating controls shown in every Write view while a meeting is being recorded. */
export function MeetingRecorderBar({ activeId, onOpenDoc }: { activeId: string; onOpenDoc: (id: string) => void }) {
  const { t } = useI18n()
  const snap = useMeetingSnapshot()
  const [confirmStop, setConfirmStop] = useState(false)
  const recording = snap.state !== 'idle'

  // Closing or reloading the tab would end the meeting recording; ask first.
  useEffect(() => {
    if (!recording) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [recording])

  // The stop confirmation quietly resets if not used.
  useEffect(() => {
    if (!confirmStop) return
    const id = setTimeout(() => setConfirmStop(false), 4000)
    return () => clearTimeout(id)
  }, [confirmStop])

  if (!recording) return null

  const paused = snap.state === 'paused'
  const busy = snap.state === 'starting' || snap.state === 'stopping'
  const sourceLabel =
    snap.source === 'mixed'
      ? snap.hasMeetingAudio
        ? t('Mic + meeting audio')
        : t('Microphone')
      : snap.source === 'mic-only'
        ? t('Microphone only')
        : t('Audio only, no live text')

  return (
    <div className={`meeting-bar ${paused ? 'paused' : ''}`} role="region" aria-label={t('Meeting recording')}>
      <div className="meeting-bar-main">
        <span className="meeting-dot" aria-hidden="true" />
        <div className="meeting-bar-status">
          <strong>
            {snap.state === 'starting' ? t('Starting…') : snap.state === 'stopping' ? t('Saving…') : paused ? t('Paused') : t('Recording')}
            <span className="meeting-time">{formatElapsed(snap.elapsedMs)}</span>
          </strong>
          <small>
            {sourceLabel}
            {snap.savingAudio && <> · {t('saving audio')}</>}
            {snap.lines > 0 && <> · {t('{n} lines', { n: snap.lines })}</>}
          </small>
        </div>
        <div className="meeting-bar-actions">
          {snap.docId && snap.docId !== activeId && (
            <button type="button" className="icon-button" onClick={() => onOpenDoc(snap.docId!)} title={t('Open transcript')} aria-label={t('Open transcript')}>
              <GoogleIcon name="description" size={18} />
            </button>
          )}
          <button type="button" className="icon-button" disabled={busy} onClick={() => (paused ? meetingSession.resume() : meetingSession.pause())} title={paused ? t('Resume') : t('Pause')} aria-label={paused ? t('Resume') : t('Pause')}>
            <GoogleIcon name={paused ? 'play_arrow' : 'pause'} size={20} />
          </button>
          {confirmStop ? (
            <button
              type="button"
              className="button danger small"
              onClick={() => {
                setConfirmStop(false)
                void meetingSession.stop()
              }}
            >
              {t('Stop and save')}
            </button>
          ) : (
            <button type="button" className="meeting-stop" disabled={busy} onClick={() => setConfirmStop(true)} title={t('Stop')} aria-label={t('Stop')}>
              <GoogleIcon name="stop" size={18} fill />
            </button>
          )}
        </div>
      </div>
      {snap.interim && <p className="meeting-interim">{snap.interim}</p>}
      {snap.warnings.length > 0 && <p className="meeting-warning">{t(snap.warnings[snap.warnings.length - 1])}</p>}
    </div>
  )
}

/** Recordings attached to a page; refreshes when `version` changes (e.g. after a meeting ends). */
export function useDocRecordings(docId: string | undefined, version: unknown) {
  const [recordings, setRecordings] = useState<LocalRecording[]>([])
  useEffect(() => {
    let cancelled = false
    if (!docId) {
      setRecordings([])
      return
    }
    recordingsForDoc(docId)
      .then(r => !cancelled && setRecordings(r.filter(x => x.chunks > 0)))
      .catch(() => !cancelled && setRecordings([]))
    return () => {
      cancelled = true
    }
  }, [docId, version])
  return recordings
}

/** Saves a recording as a file named after the page and its start time. */
export async function downloadRecording(recording: LocalRecording, baseName: string) {
  const blob = await recordingBlob(recording)
  const ext = recording.mimeType.includes('mp4') ? 'm4a' : recording.mimeType.includes('ogg') ? 'ogg' : 'webm'
  const stamp = recording.startedAt.slice(0, 16).replace('T', ' ').replace(':', 'h')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${baseName} ${stamp}.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
