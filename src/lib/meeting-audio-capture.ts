/*
 * Audio sources for meeting recording, mixed into one track:
 * - the microphone (your voice, or the room when meeting in person);
 * - the meeting's audio, captured with screen sharing: a Google Meet tab with
 *   "Share tab audio", or the entire screen with "Share system audio" for the
 *   Zoom desktop app (Chrome/Edge on Windows and ChromeOS).
 * Mixing keeps a single steady track for the recognizer and the recorder even
 * if one source stops (for example the user ends screen sharing).
 */

export type MeetingAudio = {
  /** Mixed audio for recognition and recording. */
  track: MediaStreamTrack
  stream: MediaStream
  hasMic: boolean
  hasMeetingAudio: boolean
  /** Fires once if the shared meeting audio ends (user pressed "Stop sharing"). */
  onMeetingAudioEnded: (fn: () => void) => void
  stop: () => void
}

export class MeetingAudioError extends Error {
  constructor(
    public readonly code: 'no-sources' | 'mic-denied' | 'share-cancelled' | 'share-no-audio' | 'unsupported',
    message: string
  ) {
    super(message)
  }
}

const isPermissionError = (err: unknown) => err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')

export async function captureMeetingAudio({ mic, meeting }: { mic: boolean; meeting: boolean }): Promise<MeetingAudio> {
  if (!mic && !meeting) throw new MeetingAudioError('no-sources', 'Choose at least one audio source.')
  if (!navigator.mediaDevices?.getUserMedia) throw new MeetingAudioError('unsupported', 'This browser cannot record audio.')

  const streams: MediaStream[] = []
  const stopAll = () => streams.forEach(s => s.getTracks().forEach(t => t.stop()))
  let display: MediaStream | null = null

  try {
    if (meeting) {
      if (!navigator.mediaDevices.getDisplayMedia) throw new MeetingAudioError('unsupported', 'This browser cannot capture meeting audio. Use Chrome or Edge on a computer.')
      try {
        display = await navigator.mediaDevices.getDisplayMedia({
          // Chrome only shares audio together with a video surface; the video is ignored.
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          // Chrome hints: offer system audio for whole-screen shares, keep the meeting audible.
          systemAudio: 'include',
          suppressLocalAudioPlayback: false,
          selfBrowserSurface: 'exclude',
        } as DisplayMediaStreamOptions)
      } catch (err) {
        throw new MeetingAudioError('share-cancelled', isPermissionError(err) ? 'Sharing was cancelled.' : 'Meeting audio could not be shared.')
      }
      streams.push(display)
      if (!display.getAudioTracks().length) {
        throw new MeetingAudioError(
          'share-no-audio',
          'The share has no sound. Share again and turn on “Share tab audio” (Google Meet) or “Share system audio” (Zoom app).'
        )
      }
      // Nothing reads the picture; disabling it saves work while the share stays alive.
      display.getVideoTracks().forEach(t => (t.enabled = false))
    }

    if (mic) {
      try {
        // Echo cancellation keeps the speakers' meeting audio from being heard twice.
        streams.push(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }))
      } catch (err) {
        throw new MeetingAudioError('mic-denied', isPermissionError(err) ? 'Microphone access is blocked. Allow it in the site settings, or record meeting audio only.' : 'The microphone could not be opened.')
      }
    }
  } catch (err) {
    stopAll()
    throw err
  }

  const ctx = new AudioContext()
  const destination = ctx.createMediaStreamDestination()
  for (const s of streams) {
    if (s.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(destination)
  }
  // Some browsers start audio contexts suspended until a gesture; this runs right after one.
  void ctx.resume()

  const endedListeners: (() => void)[] = []
  const meetingTrack = display?.getAudioTracks()[0]
  if (display) {
    const ended = () => endedListeners.splice(0).forEach(fn => fn())
    meetingTrack?.addEventListener('ended', ended, { once: true })
    display.getVideoTracks()[0]?.addEventListener('ended', ended, { once: true })
  }

  return {
    track: destination.stream.getAudioTracks()[0],
    stream: destination.stream,
    hasMic: mic,
    hasMeetingAudio: !!display,
    onMeetingAudioEnded: fn => endedListeners.push(fn),
    stop: () => {
      stopAll()
      destination.stream.getTracks().forEach(t => t.stop())
      void ctx.close()
    },
  }
}
