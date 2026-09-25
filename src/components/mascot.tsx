'use client'

import { useEffect, useRef, useState } from 'react'

/*
 * My Space's mascot: a small mint blob with two eyes, after the idea of
 * jeremy-prt/bloub (MIT) but drawn for this design system. It lives in a corner
 * of the screen and can be dragged anywhere; it remembers where you left it.
 * No animation library: SVG + CSS, a few timers, nothing while the tab is hidden.
 */

type Mood = 'idle' | 'curious' | 'held' | 'happy' | 'sleepy'
type Gaze = { x: number; y: number }

const MAX_GAZE = 2.4 // viewBox units the eyes may travel from centre
const SLEEP_AFTER = 60_000
const STORE_KEY = 'my-space:mascot'
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

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
      ) : mood === 'held' ? (
        <>
          <circle className="mascot-eye" cx="12.7" cy="15" r="2.5" />
          <circle className="mascot-eye" cx="19.3" cy="15" r="2.5" />
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
  const root = useRef<HTMLDivElement>(null)
  const moodRef = useRef(mood)
  moodRef.current = mood
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; lastX: number; moved: boolean } | null>(null)
  const lastActivity = useRef(Date.now())

  const size = () => root.current?.offsetWidth ?? 52

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

  // Idle life: blinks, glances, falling asleep when you're away.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms))

    const scheduleBlink = () =>
      later(() => {
        if (!document.hidden && moodRef.current !== 'sleepy') {
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

    const sleepCheck = setInterval(() => {
      if (moodRef.current === 'idle' && Date.now() - lastActivity.current > SLEEP_AFTER) {
        setMood('sleepy')
        setGaze({ x: 0, y: 1 })
      }
    }, 5000)

    scheduleBlink()
    scheduleGlance()
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(sleepCheck)
    }
  }, [])

  // Looks at the cursor when it comes close; any activity wakes it up.
  useEffect(() => {
    let frame = 0
    const wake = () => {
      lastActivity.current = Date.now()
      if (moodRef.current === 'sleepy') setMood('idle')
    }
    const onMove = (e: PointerEvent) => {
      wake()
      if (frame || drag.current) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const box = root.current?.getBoundingClientRect()
        if (!box || moodRef.current === 'happy') return
        const dx = e.clientX - (box.left + box.width / 2)
        const dy = e.clientY - (box.top + box.height / 2)
        const dist = Math.hypot(dx, dy) || 1
        if (dist > 240) {
          if (moodRef.current === 'curious') setMood('idle')
          return
        }
        setMood('curious')
        const reach = Math.min(1, dist / 60) * MAX_GAZE
        setGaze({ x: (dx / dist) * reach, y: (dy / dist) * reach * 0.7 })
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', wake)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', wake)
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
      // A click: happy hop.
      setMood('happy')
      setTimeout(() => setMood('idle'), 900)
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

  return (
    <div
      ref={root}
      className={`floating-mascot mascot-${mood} ${landing ? 'mascot-landing' : ''}`}
      style={pos ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` } : { visibility: 'hidden' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Drag me anywhere"
      aria-hidden="true"
    >
      <svg className="mascot" viewBox="0 0 32 32" style={{ transform: `rotate(${tilt}deg)` }}>
        <g className="mascot-bounce">
          <circle className="mascot-body" cx="16" cy="16" r="15" />
          <Face gaze={gaze} blink={blink} mood={mood} />
          {mood === 'sleepy' && (
            <text className="mascot-z" x="25" y="6">
              z
            </text>
          )}
        </g>
      </svg>
    </div>
  )
}
