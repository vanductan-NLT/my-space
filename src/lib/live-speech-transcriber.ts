/*
 * Long-running speech → text on top of the browser's Web Speech API.
 *
 * Browsers end a recognition session on their own (silence, a few minutes of
 * audio, a network blip). For a meeting that runs for hours, this wrapper keeps
 * restarting it until `stop()` is called, so there is no time limit. When the
 * browser accepts a MediaStreamTrack (Chrome 139+), recognition listens to that
 * track — e.g. microphone mixed with the Zoom/Meet audio — instead of only the
 * default microphone.
 */

export type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>

export type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: (track?: MediaStreamTrack) => void
  stop: () => void
  abort: () => void
  onresult: ((e: { resultIndex: number; results: SpeechResultList }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export const getSpeechRecognition = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * True when `start()` takes a MediaStreamTrack. Older engines silently ignore
 * extra arguments, so pass a non-track: an engine that knows the parameter
 * rejects it with a TypeError; one that doesn't starts the mic (aborted at once).
 * Call it after microphone permission is granted so that fallback start can't
 * raise a permission prompt.
 */
export const supportsTrackInput = (SR: SpeechRecognitionCtor): boolean => {
  const probe = new SR()
  try {
    probe.start('probe' as unknown as MediaStreamTrack)
    probe.abort()
    return false
  } catch (err) {
    return err instanceof TypeError
  }
}

/** Errors that restarting can't fix; everything else (no-speech, network, aborted) is retried. */
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture'])

export type TranscriberOptions = {
  SR: SpeechRecognitionCtor
  lang: string
  /** Audio to transcribe; omitted = the browser's default microphone. */
  track?: MediaStreamTrack
  onFinal: (text: string) => void
  onInterim?: (text: string) => void
  /** A fatal error stopped transcription (e.g. microphone permission denied). */
  onFatal?: (error: string) => void
  /** Delay before restarting after the engine ends a session, in ms. */
  restartDelay?: (attempt: number) => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
}

export class LiveSpeechTranscriber {
  private rec: SpeechRecognitionLike | null = null
  private running = false
  private failures = 0
  private timer: unknown = null
  private readonly opts: Required<Pick<TranscriberOptions, 'restartDelay' | 'setTimer' | 'clearTimer'>> & TranscriberOptions

  constructor(opts: TranscriberOptions) {
    this.opts = {
      // Quick restart after a normal end; back off while errors repeat (e.g. offline).
      restartDelay: attempt => (attempt === 0 ? 150 : Math.min(10000, 1000 * 2 ** (attempt - 1))),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: id => clearTimeout(id as ReturnType<typeof setTimeout>),
      ...opts,
    }
  }

  get active() {
    return this.running
  }

  start() {
    if (this.running) return
    this.running = true
    this.failures = 0
    this.spawn()
  }

  /** Stops for good; a result already being finalised may still arrive via onFinal. */
  stop() {
    this.running = false
    if (this.timer !== null) this.opts.clearTimer(this.timer)
    this.timer = null
    const rec = this.rec
    this.rec = null
    if (rec) {
      rec.onend = null
      rec.onerror = null
      try {
        rec.stop()
      } catch {
        // Already stopped.
      }
    }
    this.opts.onInterim?.('')
  }

  private spawn() {
    if (!this.running) return
    const { SR, lang, track } = this.opts
    const rec = new SR()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    let failed = false

    rec.onresult = e => {
      this.failures = 0
      let pending = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const clean = text.replace(/\s+/g, ' ').trim()
          if (clean) this.opts.onFinal(clean)
        } else pending += text
      }
      this.opts.onInterim?.(pending.trim())
    }

    rec.onerror = e => {
      if (FATAL_ERRORS.has(e.error)) {
        this.stop()
        this.opts.onFatal?.(e.error)
        return
      }
      if (e.error !== 'no-speech' && e.error !== 'aborted') failed = true
    }

    rec.onend = () => {
      if (this.rec !== rec || !this.running) return
      this.rec = null
      this.opts.onInterim?.('')
      this.failures = failed ? this.failures + 1 : 0
      this.timer = this.opts.setTimer(() => {
        this.timer = null
        this.spawn()
      }, this.opts.restartDelay(this.failures))
    }

    this.rec = rec
    try {
      if (track) rec.start(track)
      else rec.start()
    } catch {
      // A start that throws (e.g. called too fast) is retried like a failed session.
      failed = true
      rec.onend?.()
    }
  }
}
