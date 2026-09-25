'use client'

import { useEffect, useRef, useState } from 'react'
import { quoteBag } from '@/lib/quotes'
import { useI18n } from '@/lib/i18n'

/*
 * My Space's mascot: a small mint blob with two eyes, after the idea of
 * jeremy-prt/bloub (MIT) but drawn for this design system. It lives in a corner
 * of the screen and can be dragged anywhere; it remembers where you left it.
 * It watches you type, cheers you on now and then with a short line, and falls
 * asleep when you're away. SVG + CSS, a few timers, nothing while hidden.
 */

type Mood = 'idle' | 'curious' | 'held' | 'happy' | 'sleepy' | 'typing' | 'excited' | 'oops'
type Gaze = { x: number; y: number }

const MAX_GAZE = 2.4 // viewBox units the eyes may travel from centre
const SLEEP_AFTER = 60_000
const TYPING_IDLE = 1800 // ms without keys before it relaxes
const FAST_KEYS_PER_SEC = 6
const CHEER_EVERY_CHARS = 600
const STORE_KEY = 'my-space:mascot'
export const QUOTES_KEY = 'my-space:quotes'
export const QUOTES_EVENT = 'my-space:quotes-change'
export type QuoteSetting = 'on' | 'off'

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Quotes on/off; their language follows the interface language. */
export function readQuoteSetting(): QuoteSetting {
  try {
    return localStorage.getItem(QUOTES_KEY) === 'off' ? 'off' : 'on'
  } catch {
    return 'on'
  }
}

const isEditable = (el: EventTarget | null) => {
  const node = el as HTMLElement | null
  if (!node) return false
  if (node.isContentEditable) return true
  return node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && /^(text|search|url|email|)$/.test((node as HTMLInputElement).type))
}

/** Where the text caret is on screen, for the mascot to look at. */
const caretPoint = (el: HTMLElement) => {
  const sel = window.getSelection()
  if (el.isContentEditable && sel?.rangeCount) {
    const range = sel.getRangeAt(0)
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
    if (rect && (rect.width || rect.height || rect.left)) return { x: rect.left, y: rect.top + rect.height / 2 }
  }
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

function Face({ gaze, blink, mood }: { gaze: Gaze; blink: boolean; mood: Mood }) {
  return (
    <g className="mascot-eyes" style={{ transform: `translate(${gaze.x}px, ${gaze.y}px)` }}>
      {mood === 'happy' ? (
        <>
          <path className="mascot-line" d="M10.6 16.4 Q12.6 13.2 14.6 16.4" />
          <path className="mascot-line" d="M17.4 16.4 Q19.4 13.2 21.4 16.4" />
        </>
      ) : mood === 'sleepy' ? (
        <>
          <path className="mascot-line" d="M10.8 16 Q12.7 17.4 14.6 16" />
          <path className="mascot-line" d="M17.4 16 Q19.3 17.4 21.2 16" />
        </>
      ) : mood === 'oops' ? (
        <>
          <path className="mascot-line" d="M11 13.2 L14 15.2 L11 17.2" />
          <path className="mascot-line" d="M21 13.2 L18 15.2 L21 17.2" />
        </>
      ) : mood === 'held' ? (
        <>
          <circle className="mascot-eye" cx="12.7" cy="15" r="2.5" />
          <circle className="mascot-eye" cx="19.3" cy="15" r="2.5" />
        </>
      ) : mood === 'excited' ? (
        <>
          <circle className="mascot-eye" cx="12.7" cy="15" r="2.8" />
          <circle className="mascot-eye" cx="19.3" cy="15" r="2.8" />
          <circle className="mascot-sparkle" cx="13.6" cy="14" r="0.9" />
          <circle className="mascot-sparkle" cx="20.2" cy="14" r="0.9" />
        </>
      ) : (
        <g className={blink ? 'mascot-blink' : undefined}>
          <rect className="mascot-eye" x="11" y="11" width="3.4" height="8" rx="1.7" />
          <rect className="mascot-eye" x="17.6" y="11" width="3.4" height="8" rx="1.7" />
        </g>
      )}
    </g>
  )
}

/** Still version of the face, used as the logo in the nav rail. */
export function MascotLogo({ size = 32 }: { size?: number }) {
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle className="mascot-body" cx="16" cy="16" r="15" />
      <Face gaze={{ x: 0, y: 0 }} blink={false} mood="idle" />
    </svg>
  )
}

/** The living mascot: floats in a corner, draggable, reacts to you. */
export function FloatingMascot() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [gaze, setGaze] = useState<Gaze>({ x: 0, y: 0 })
  const [blink, setBlink] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [tilt, setTilt] = useState(0)
  const [landing, setLanding] = useState(false)
  const [nod, setNod] = useState(0)
  const [quote, setQuote] = useState<string | null>(null)
  const { lang, t } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const moodRef = useRef(mood)
  moodRef.current = mood
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; lastX: number; moved: boolean } | null>(null)
  const lastActivity = useRef(Date.now())
  const lastTyped = useRef(0)
  const typing = useRef({ keys: [] as number[], backspaces: 0, chars: 0, lastNod: 0, relax: 0 as ReturnType<typeof setTimeout> | 0 })
  const quotes = useRef<{ setting: QuoteSetting; next: () => string }>({ setting: 'off', next: () => '' })
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const size = () => root.current?.offsetWidth ?? 52

  const say = (text?: string) => {
    if (quotes.current.setting === 'off') return
    setQuote(text ?? quotes.current.next())
    if (quoteTimer.current) clearTimeout(quoteTimer.current)
    quoteTimer.current = setTimeout(() => setQuote(null), 7000)
  }

  const cheer = () => {
    setMood('happy')
    setTimeout(() => setMood(m => (m === 'happy' ? 'idle' : m)), 900)
  }

  // On/off from Settings; the language is the interface language.
  useEffect(() => {
    const load = () => {
      const setting = readQuoteSetting()
      quotes.current = { setting, next: setting === 'off' ? () => '' : quoteBag(lang) }
      if (setting === 'off') setQuote(null)
    }
    load()
    window.addEventListener(QUOTES_EVENT, load)
    return () => window.removeEventListener(QUOTES_EVENT, load)
  }, [lang])

  // Place it: the saved spot (kept as a fraction of the free space, so it stays
  // in the same corner when the window changes size), else bottom-right.
  useEffect(() => {
    const place = () => {
      const s = size()
      const maxX = window.innerWidth - s - 6
      const maxY = window.innerHeight - s - 6
      let saved: { fx: number; fy: number } | null = null
      try {
        saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      } catch {}
      if (saved) return setPos({ x: clamp(saved.fx * maxX, 6, maxX), y: clamp(saved.fy * maxY, 6, maxY) })
      const phone = window.matchMedia('(max-width: 700px)').matches
      setPos({ x: window.innerWidth - s - (phone ? 16 : 28), y: window.innerHeight - s - (phone ? 150 : 28) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])

  // Idle life: blinks, glances, a line every few minutes, sleep when you're away.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms))

    const scheduleBlink = () =>
      later(() => {
        if (!document.hidden && ['idle', 'curious', 'typing'].includes(moodRef.current)) {
          setBlink(true)
          later(() => setBlink(false), 130)
          if (Math.random() < 0.2) {
            later(() => setBlink(true), 260)
            later(() => setBlink(false), 390)
          }
        }
        scheduleBlink()
      }, rand(2600, 6200))

    const scheduleGlance = () =>
      later(() => {
        if (!document.hidden && moodRef.current === 'idle') {
          const back = Math.random() < 0.35
          const angle = rand(0, Math.PI * 2)
          const dist = back ? 0 : rand(0.8, MAX_GAZE)
          setGaze({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.7 })
        }
        scheduleGlance()
      }, rand(1800, 4600))

    // A line every 6-10 minutes — but only in a pause, never mid-sentence.
    const scheduleQuote = (delay = rand(6, 10) * 60_000) =>
      later(() => {
        const busy = Date.now() - lastTyped.current < 4000 || document.hidden || moodRef.current === 'sleepy'
        if (busy) return scheduleQuote(15_000)
        say()
        scheduleQuote()
      }, delay)

    const sleepCheck = setInterval(() => {
      if (moodRef.current === 'idle' && Date.now() - lastActivity.current > SLEEP_AFTER) {
        setMood('sleepy')
        setGaze({ x: 0, y: 1 })
      }
    }, 5000)

    if (!reduced) {
      scheduleBlink()
      scheduleGlance()
    }
    scheduleQuote()
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(sleepCheck)
    }
  }, [])

  // Looks at the cursor when it comes close; watches you type.
  useEffect(() => {
    let frame = 0
    const lookAt = (x: number, y: number, limit = 240) => {
      const box = root.current?.getBoundingClientRect()
      if (!box) return false
      const dx = x - (box.left + box.width / 2)
      const dy = y - (box.top + box.height / 2)
      const dist = Math.hypot(dx, dy) || 1
      if (dist > limit) return false
      const reach = Math.min(1, dist / 60) * MAX_GAZE
      setGaze({ x: (dx / dist) * reach, y: (dy / dist) * reach * 0.7 })
      return true
    }
    const wake = () => {
      lastActivity.current = Date.now()
      if (moodRef.current === 'sleepy') setMood('idle')
    }
    const onMove = (e: PointerEvent) => {
      wake()
      if (frame || drag.current || Date.now() - lastTyped.current < TYPING_IDLE) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (moodRef.current === 'happy') return
        if (lookAt(e.clientX, e.clientY)) setMood(m => (m === 'idle' ? 'curious' : m))
        else if (moodRef.current === 'curious') setMood('idle')
      })
    }
    const onKey = (e: KeyboardEvent) => {
      wake()
      if (!isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const printable = e.key.length === 1
      if (!printable && e.key !== 'Backspace' && e.key !== 'Enter') return
      const now = Date.now()
      const t = typing.current
      lastTyped.current = now
      if (drag.current || moodRef.current === 'happy') return

      if (e.key === 'Backspace') t.backspaces++
      else t.backspaces = 0
      if (printable) t.chars++
      t.keys = [...t.keys.filter(k => now - k < 2000), now]

      const fast = t.keys.length / 2 >= FAST_KEYS_PER_SEC
      setMood(t.backspaces >= 6 ? 'oops' : fast ? 'excited' : 'typing')
      const caret = caretPoint(e.target as HTMLElement)
      lookAt(caret.x, caret.y, Infinity)
      if (now - t.lastNod > 280) {
        t.lastNod = now
        setNod(n => n + 1)
      }
      if (t.chars >= CHEER_EVERY_CHARS) {
        t.chars = 0
        cheer()
        say()
      }
      if (t.relax) clearTimeout(t.relax)
      t.relax = setTimeout(() => {
        t.keys = []
        t.backspaces = 0
        setMood(m => (['typing', 'excited', 'oops'].includes(m) ? 'idle' : m))
        setGaze({ x: 0, y: 0 })
      }, TYPING_IDLE)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pos) return
    try {
      // Keep receiving moves when a fast finger/mouse leaves the mascot.
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, startX: e.clientX, startY: e.clientY, lastX: e.clientX, moved: false }
    lastActivity.current = Date.now()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return
    if (!d.moved) {
      d.moved = true
      setMood('held')
      setGaze({ x: 0, y: 0 })
      setQuote(null)
    }
    const s = size()
    setPos({
      x: clamp(e.clientX - d.dx, 6, window.innerWidth - s - 6),
      y: clamp(e.clientY - d.dy, 6, window.innerHeight - s - 6),
    })
    // Swing with the drag direction.
    setTilt(clamp((e.clientX - d.lastX) * 1.6, -20, 20))
    d.lastX = e.clientX
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    setTilt(0)
    if (!d.moved) {
      // A click/tap: happy hop and a line.
      cheer()
      say()
      return
    }
    setMood('idle')
    setLanding(true)
    setTimeout(() => setLanding(false), 450)
    if (pos) {
      const s = size()
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ fx: pos.x / (window.innerWidth - s - 6), fy: pos.y / (window.innerHeight - s - 6) })
        )
      } catch {}
    }
  }

  // The speech bubble opens towards the middle of the screen.
  const bubbleSide = pos && pos.x > window.innerWidth / 2 ? 'left' : 'right'
  const bubbleVertical = pos && pos.y < 140 ? 'below' : 'above'

  return (
    <div
      ref={root}
      className={`floating-mascot mascot-${mood} ${landing ? 'mascot-landing' : ''}`}
      style={pos ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` } : { visibility: 'hidden' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title={t('Drag me anywhere · tap me')}
    >
      <svg className="mascot" viewBox="0 0 32 32" style={{ transform: `rotate(${tilt}deg)` }} aria-hidden="true">
        <g className={`mascot-bounce ${nod % 2 ? 'nod-a' : nod ? 'nod-b' : ''}`}>
          <circle className="mascot-body" cx="16" cy="16" r="15" />
          <Face gaze={gaze} blink={blink} mood={mood} />
          {mood === 'sleepy' && (
            <text className="mascot-z" x="25" y="6">
              z
            </text>
          )}
        </g>
      </svg>
      {quote && (
        <div
          className={`mascot-quote ${bubbleSide} ${bubbleVertical}`}
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setQuote(null)}
          role="status"
        >
          {quote}
        </div>
      )}
    </div>
  )
}
