import { describe, expect, it } from 'vitest'
import { LiveSpeechTranscriber, supportsTrackInput, type SpeechRecognitionCtor, type SpeechRecognitionLike, type SpeechResultList } from './live-speech-transcriber'

/** A scriptable stand-in for the browser's SpeechRecognition. */
const makeFakeSR = ({ acceptsTrack = true } = {}) => {
  const instances: FakeRecognition[] = []
  class FakeRecognition implements SpeechRecognitionLike {
    lang = ''
    continuous = false
    interimResults = false
    startedWith: MediaStreamTrack | undefined | 'none' = 'none'
    stopped = false
    onresult: SpeechRecognitionLike['onresult'] = null
    onerror: SpeechRecognitionLike['onerror'] = null
    onend: SpeechRecognitionLike['onend'] = null
    constructor() {
      instances.push(this)
    }
    start(track?: MediaStreamTrack) {
      if (acceptsTrack && arguments.length && !(track && typeof track === 'object')) throw new TypeError('not a MediaStreamTrack')
      this.startedWith = track
    }
    stop() {
      this.stopped = true
    }
    abort() {
      this.stopped = true
    }
    say(text: string, isFinal: boolean) {
      const results = [Object.assign([{ transcript: text }], { isFinal })] as unknown as SpeechResultList
      this.onresult?.({ resultIndex: 0, results })
    }
  }
  return { SR: FakeRecognition as unknown as SpeechRecognitionCtor, instances }
}

/** Runs timers on demand so restart behaviour is deterministic. */
const manualTimers = () => {
  const queue: { fn: () => void; ms: number }[] = []
  return {
    setTimer: (fn: () => void, ms: number) => {
      queue.push({ fn, ms })
      return queue.length - 1
    },
    clearTimer: (id: unknown) => {
      if (typeof id === 'number' && queue[id]) queue[id].fn = () => undefined
    },
    delays: () => queue.map(q => q.ms),
    runNext: () => queue.shift()?.fn(),
  }
}

describe('LiveSpeechTranscriber', () => {
  it('reports final text, ignores empty results and clears interim text', () => {
    const { SR, instances } = makeFakeSR()
    const finals: string[] = []
    const interims: string[] = []
    const t = new LiveSpeechTranscriber({ SR, lang: 'vi-VN', onFinal: f => finals.push(f), onInterim: i => interims.push(i) })
    t.start()
    instances[0].say('xin  chào', false)
    instances[0].say('xin  chào   mọi người ', true)
    instances[0].say('   ', true)
    expect(finals).toEqual(['xin chào mọi người'])
    expect(interims).toEqual(['xin  chào', '', ''])
    expect(instances[0].lang).toBe('vi-VN')
    expect(instances[0].continuous).toBe(true)
  })

  it('keeps restarting when the browser ends a session, so there is no time limit', () => {
    const { SR, instances } = makeFakeSR()
    const timers = manualTimers()
    const t = new LiveSpeechTranscriber({ SR, lang: 'en-US', onFinal: () => undefined, ...timers })
    t.start()
    for (let i = 0; i < 5; i++) {
      instances[instances.length - 1].onend?.()
      timers.runNext()
    }
    expect(instances).toHaveLength(6)
    expect(timers.delays()).toEqual([])
    expect(t.active).toBe(true)
  })

  it('backs off while errors repeat and resets after speech arrives', () => {
    const { SR, instances } = makeFakeSR()
    const timers = manualTimers()
    const delays: number[] = []
    const t = new LiveSpeechTranscriber({ SR, lang: 'en-US', onFinal: () => undefined, ...timers, restartDelay: a => (delays.push(a), a * 1000) })
    t.start()
    for (let i = 0; i < 3; i++) {
      const rec = instances[instances.length - 1]
      rec.onerror?.({ error: 'network' })
      rec.onend?.()
      timers.runNext()
    }
    expect(delays).toEqual([1, 2, 3])
    instances[instances.length - 1].say('back online', true)
    instances[instances.length - 1].onend?.()
    expect(delays).toEqual([1, 2, 3, 0])
  })

  it('treats silence (no-speech) as a normal restart, not a failure', () => {
    const { SR, instances } = makeFakeSR()
    const timers = manualTimers()
    const delays: number[] = []
    const t = new LiveSpeechTranscriber({ SR, lang: 'en-US', onFinal: () => undefined, ...timers, restartDelay: a => (delays.push(a), 0) })
    t.start()
    instances[0].onerror?.({ error: 'no-speech' })
    instances[0].onend?.()
    expect(delays).toEqual([0])
  })

  it('stops for good on a fatal error such as a blocked microphone', () => {
    const { SR, instances } = makeFakeSR()
    const timers = manualTimers()
    const fatal: string[] = []
    const t = new LiveSpeechTranscriber({ SR, lang: 'en-US', onFinal: () => undefined, onFatal: e => fatal.push(e), ...timers })
    t.start()
    instances[0].onerror?.({ error: 'not-allowed' })
    instances[0].onend?.()
    expect(fatal).toEqual(['not-allowed'])
    expect(t.active).toBe(false)
    expect(timers.delays()).toEqual([])
  })

  it('does not restart after stop()', () => {
    const { SR, instances } = makeFakeSR()
    const timers = manualTimers()
    const t = new LiveSpeechTranscriber({ SR, lang: 'en-US', onFinal: () => undefined, ...timers })
    t.start()
    const rec = instances[0]
    t.stop()
    expect(rec.stopped).toBe(true)
    rec.onend?.()
    expect(instances).toHaveLength(1)
    expect(timers.delays()).toEqual([])
  })

  it('listens to the given track when one is provided', () => {
    const { SR, instances } = makeFakeSR()
    const track = { kind: 'audio' } as MediaStreamTrack
    new LiveSpeechTranscriber({ SR, lang: 'en-US', track, onFinal: () => undefined }).start()
    expect(instances[0].startedWith).toBe(track)
  })
})

describe('supportsTrackInput', () => {
  it('is true when start() rejects a non-track argument', () => {
    expect(supportsTrackInput(makeFakeSR({ acceptsTrack: true }).SR)).toBe(true)
  })

  it('is false when start() ignores the argument (older engines)', () => {
    const { SR, instances } = makeFakeSR({ acceptsTrack: false })
    expect(supportsTrackInput(SR)).toBe(false)
    expect(instances[0].stopped).toBe(true)
  })
})
