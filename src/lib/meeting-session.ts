import type { JSONContent } from '@tiptap/react'
import { db } from './db'
import { captureMeetingAudio, type MeetingAudio } from './meeting-audio-capture'
import { getSpeechRecognition, LiveSpeechTranscriber, supportsTrackInput } from './live-speech-transcriber'
import { beginRecording, finishRecording, saveRecordingChunk } from './meeting-recording-store'
import { appendBlocks, transcriptParagraph } from './transcript-format'

/*
 * One meeting recording at a time, living outside React so it keeps going while
 * the user switches pages or modes. It mixes the chosen audio, transcribes it
 * live into a page (with elapsed-time stamps) and saves the audio alongside.
 * The Write workspace plugs in a "sink" so new lines land in the open editor;
 * without one, lines are appended to the stored page directly.
 */

export type MeetingState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping'

/** How live text is produced: from the mixed meeting track, from the default mic only, or not at all. */
export type TranscriptSource = 'mixed' | 'mic-only' | 'none'

export type MeetingSnapshot = {
  state: MeetingState
  docId: string | null
  elapsedMs: number
  interim: string
  lines: number
  source: TranscriptSource
  savingAudio: boolean
  hasMeetingAudio: boolean
  /** Short notice keys (English source strings) the UI translates and shows. */
  warnings: string[]
  error: string | null
}

export type MeetingStartOptions = {
  lang: string
  mic: boolean
  meeting: boolean
  saveAudio: boolean
  /** Creates the transcript page once audio capture succeeded (so a cancelled share leaves no empty page). */
  createDoc: () => Promise<string>
}

export type TranscriptSink = (docId: string, blocks: JSONContent[]) => Promise<void> | void

const IDLE: MeetingSnapshot = { state: 'idle', docId: null, elapsedMs: 0, interim: '', lines: 0, source: 'none', savingAudio: false, hasMeetingAudio: false, warnings: [], error: null }

/** Appends lines to the stored page (used when the page isn't open in the editor). */
export const appendToStoredDoc: TranscriptSink = async (docId, blocks) => {
  await db.transaction('rw', db.documents, async () => {
    const doc = await db.documents.get(docId)
    if (!doc) return
    await db.documents.update(docId, { content: appendBlocks(doc.content, blocks), updatedAt: new Date().toISOString() })
  })
}

const pickMimeType = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? ''

class MeetingSession {
  private snapshot: MeetingSnapshot = IDLE
  private listeners = new Set<() => void>()
  private sink: TranscriptSink | null = null
  private writes: Promise<void> = Promise.resolve()
  private audio: MeetingAudio | null = null
  private transcriber: LiveSpeechTranscriber | null = null
  private recorder: MediaRecorder | null = null
  private recordingId: string | null = null
  private chunkSeq = 0
  private activeSince = 0
  private accumulatedMs = 0
  private ticker: ReturnType<typeof setInterval> | null = null

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.snapshot

  /** The workspace routes lines into the open editor; `null` falls back to the stored page. */
  setSink(sink: TranscriptSink | null) {
    this.sink = sink
  }

  private set(patch: Partial<MeetingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(fn => fn())
  }

  private elapsed() {
    return this.accumulatedMs + (this.activeSince ? Date.now() - this.activeSince : 0)
  }

  /** Writes in order, one at a time, through the current sink. */
  private write(blocks: JSONContent[]) {
    const docId = this.snapshot.docId
    if (!docId) return
    this.writes = this.writes
      .then(() => (this.sink ?? appendToStoredDoc)(docId, blocks))
      .catch(() => this.set({ warnings: [...new Set([...this.snapshot.warnings, 'Some transcript lines could not be saved. Export a backup.'])] }))
  }

  async start(opts: MeetingStartOptions) {
    if (this.snapshot.state !== 'idle') return
    this.set({ ...IDLE, state: 'starting' })
    const warnings: string[] = []

    let docId: string
    try {
      this.audio = await captureMeetingAudio({ mic: opts.mic, meeting: opts.meeting })
      docId = await opts.createDoc()
    } catch (err) {
      this.audio?.stop()
      this.audio = null
      this.set({ ...IDLE, error: err instanceof Error ? err.message : 'Recording could not start.' })
      return
    }
    this.set({ docId })
    const audio = this.audio
    audio.onMeetingAudioEnded(() => {
      if (this.snapshot.state === 'idle') return
      this.set({ hasMeetingAudio: false, warnings: [...this.snapshot.warnings, 'Meeting audio sharing stopped. Still recording the microphone.'] })
    })

    // Live transcript: prefer the mixed track so remote voices are heard even with headphones.
    const SR = getSpeechRecognition()
    let source: TranscriptSource = 'none'
    if (!SR) warnings.push('This browser has no speech recognition. Audio is still recorded.')
    else {
      const trackInput = supportsTrackInput(SR)
      if (trackInput) source = 'mixed'
      else if (opts.mic) {
        source = 'mic-only'
        if (audio.hasMeetingAudio) warnings.push('This browser transcribes only the microphone live. The audio file keeps the whole meeting.')
      } else warnings.push('This browser can only transcribe the microphone. The meeting audio is recorded as a file.')
      if (source !== 'none') {
        this.transcriber = new LiveSpeechTranscriber({
          SR,
          lang: opts.lang,
          track: source === 'mixed' ? audio.track : undefined,
          onFinal: text => {
            this.write([transcriptParagraph(this.elapsed(), text)])
            this.set({ lines: this.snapshot.lines + 1 })
          },
          onInterim: interim => this.set({ interim }),
          onFatal: error => this.set({ source: 'none', interim: '', warnings: [...this.snapshot.warnings, error === 'not-allowed' ? 'Speech recognition was blocked. Audio is still recorded.' : 'Live transcription stopped. Audio is still recorded.'] }),
        })
      }
    }

    // Audio file, saved chunk by chunk.
    let savingAudio = false
    if (opts.saveAudio && typeof MediaRecorder !== 'undefined') {
      try {
        const mimeType = pickMimeType()
        const recorder = new MediaRecorder(audio.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 })
        const recording = await beginRecording(docId, recorder.mimeType || mimeType || 'audio/webm')
        this.recordingId = recording.id
        this.chunkSeq = 0
        recorder.ondataavailable = e => {
          if (!e.data.size || !this.recordingId) return
          const seq = this.chunkSeq++
          void saveRecordingChunk(this.recordingId, seq, e.data, this.elapsed()).catch(() =>
            this.set({ warnings: [...new Set([...this.snapshot.warnings, 'Browser storage is full; the audio file may be incomplete.'])] })
          )
        }
        recorder.start(10000)
        this.recorder = recorder
        savingAudio = true
      } catch {
        warnings.push('The audio file could not be recorded in this browser.')
      }
    }

    this.accumulatedMs = 0
    this.activeSince = Date.now()
    this.transcriber?.start()
    this.ticker = setInterval(() => this.set({ elapsedMs: this.elapsed() }), 1000)
    this.set({ state: 'recording', source, savingAudio, hasMeetingAudio: audio.hasMeetingAudio, warnings, elapsedMs: 0 })
  }

  pause() {
    if (this.snapshot.state !== 'recording') return
    this.accumulatedMs = this.elapsed()
    this.activeSince = 0
    this.transcriber?.stop()
    if (this.recorder?.state === 'recording') this.recorder.pause()
    this.set({ state: 'paused', interim: '', elapsedMs: this.accumulatedMs })
  }

  resume() {
    if (this.snapshot.state !== 'paused') return
    this.activeSince = Date.now()
    if (this.recorder?.state === 'paused') this.recorder.resume()
    this.transcriber?.start()
    this.set({ state: 'recording' })
  }

  /** Stops everything, flushes the last audio chunk and transcript lines. */
  async stop() {
    const state = this.snapshot.state
    if (state !== 'recording' && state !== 'paused') return
    const elapsedMs = this.elapsed()
    this.activeSince = 0
    this.accumulatedMs = elapsedMs
    this.set({ state: 'stopping', interim: '', elapsedMs })
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
    this.transcriber?.stop()
    this.transcriber = null

    const recorder = this.recorder
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>(resolve => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
        recorder.stop()
      })
    }
    this.recorder = null
    // Let the final chunk's save start before closing the recording.
    await new Promise(resolve => setTimeout(resolve, 50))
    if (this.recordingId) await finishRecording(this.recordingId, elapsedMs).catch(() => undefined)
    this.recordingId = null
    this.audio?.stop()
    this.audio = null
    await this.writes
    this.set({ ...IDLE })
  }
}

export const meetingSession = new MeetingSession()
