import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaver } from './use-autosave'

type Patch = { title?: string; content?: string }

const setup = (write = vi.fn<(id: string, patch: Patch) => Promise<void>>(async () => {})) => {
  const onSaved = vi.fn()
  const onError = vi.fn()
  const saver = createAutosaver<Patch>(500, () => ({ write, onSaving: () => {}, onSaved, onError }))
  return { saver, write, onSaved, onError }
}

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('merges a title edit and a body edit made within the debounce window', async () => {
    const { saver, write } = setup()
    saver.queue('a', { title: 'Renamed' })
    saver.queue('a', { content: 'Body' })
    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('a', { title: 'Renamed', content: 'Body' })
  })

  it('writes the previous record immediately when another record is edited', async () => {
    const { saver, write } = setup()
    saver.queue('a', { content: 'A' })
    saver.queue('b', { content: 'B' })
    expect(write).toHaveBeenCalledWith('a', { content: 'A' })
    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenLastCalledWith('b', { content: 'B' })
  })

  it('flush writes pending edits without waiting for the timer', async () => {
    const { saver, write } = setup()
    saver.queue('a', { content: 'A' })
    await saver.flush()
    expect(write).toHaveBeenCalledWith('a', { content: 'A' })
    expect(saver.busy()).toBe(false)
  })

  it('keeps a failed edit and retries it with the next one', async () => {
    const write = vi.fn<(id: string, patch: Patch) => Promise<void>>(async () => {})
    write.mockRejectedValueOnce(new Error('disk full'))
    const { saver, onError } = setup(write)
    saver.queue('a', { title: 'T' })
    await saver.flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(saver.busy()).toBe(true)
    saver.queue('a', { content: 'C' })
    await saver.flush()
    expect(write).toHaveBeenLastCalledWith('a', { title: 'T', content: 'C' })
    expect(saver.busy()).toBe(false)
  })
})
