'use client'

import { useEffect, useRef, useState } from 'react'

export type AutosaveCallbacks<P> = {
  write: (id: string, patch: P) => Promise<void>
  onSaving: () => void
  onSaved: (id: string, patch: P) => void
  onError: (error: unknown) => void
}

type Pending<P> = { id: string; patch: P }

/**
 * Debounced, per-record autosave that never drops an edit.
 *
 * - Edits to the same record are merged, so a title change followed by a body
 *   change within the debounce window saves both.
 * - Editing a different record flushes the previous one immediately.
 * - A failed write is kept and retried with the next edit or flush.
 */
export function createAutosaver<P extends object>(delay: number, callbacks: () => AutosaveCallbacks<P>) {
  let pending: Pending<P> | null = null
  let inFlight = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async () => {
    if (timer) clearTimeout(timer)
    timer = null
    const job = pending
    if (!job) return
    pending = null
    inFlight++
    try {
      await callbacks().write(job.id, job.patch)
      if (!pending) callbacks().onSaved(job.id, job.patch)
    } catch (error) {
      const newer = pending as Pending<P> | null
      if (!newer) pending = job
      else if (newer.id === job.id) newer.patch = { ...job.patch, ...newer.patch }
      callbacks().onError(error)
    } finally {
      inFlight--
    }
  }

  const queue = (id: string, patch: P) => {
    if (pending && pending.id !== id) void flush()
    pending = { id, patch: pending?.id === id ? { ...pending.patch, ...patch } : patch }
    callbacks().onSaving()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), delay)
  }

  return { queue, flush, busy: () => pending !== null || inFlight > 0 }
}

/**
 * React wrapper: also flushes when the component unmounts (mode switch), when
 * the tab is hidden, and before unload.
 */
export function useAutosave<P extends object>({ delay, ...callbacks }: AutosaveCallbacks<P> & { delay: number }) {
  const latest = useRef(callbacks)
  latest.current = callbacks
  const [saver] = useState(() => createAutosaver<P>(delay, () => latest.current))

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush()
    }
    const onPageHide = () => void saver.flush()
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!saver.busy()) return
      void saver.flush()
      // Ask the browser to confirm leaving while the last edit is still being written.
      event.preventDefault()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      // Leaving the mode must not discard the last keystrokes.
      void saver.flush()
    }
  }, [saver])

  return saver
}
