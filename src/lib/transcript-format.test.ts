import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendBlocks, formatDuration, formatElapsed, transcriptParagraph } from './transcript-format'
import { WorkspaceDB } from './db'
import { beginRecording, deleteRecordingsForDocs, finishRecording, recordingBlob, recordingsForDoc, saveRecordingChunk } from './meeting-recording-store'

describe('transcript formatting', () => {
  it('formats elapsed time as MM:SS, then H:MM:SS past an hour', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_400)).toBe('01:05')
    expect(formatElapsed(3_599_000)).toBe('59:59')
    expect(formatElapsed(3_600_000 + 2 * 60_000 + 3_000)).toBe('1:02:03')
    expect(formatElapsed(-5)).toBe('00:00')
  })

  it('builds a paragraph with a monospace time stamp', () => {
    expect(transcriptParagraph(61_000, 'Chào cả nhóm')).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: '01:01', marks: [{ type: 'code' }] },
        { type: 'text', text: ' Chào cả nhóm' },
      ],
    })
  })

  it('describes durations in both languages', () => {
    expect(formatDuration(40_000, 'en')).toBe('40 s')
    expect(formatDuration(12 * 60_000, 'vi')).toBe('12 phút')
    expect(formatDuration(3_900_000, 'vi')).toBe('1 giờ 05 phút')
  })

  it('appends after existing blocks and replaces a lone empty paragraph', () => {
    const line = transcriptParagraph(0, 'a')
    expect(appendBlocks({ type: 'doc', content: [{ type: 'paragraph' }] }, [line]).content).toEqual([line])
    const heading = { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Transcript' }] }
    expect(appendBlocks({ type: 'doc', content: [heading] }, [line]).content).toEqual([heading, line])
  })
})

describe('meeting recording storage', () => {
  let database: WorkspaceDB
  beforeEach(() => {
    database = new WorkspaceDB(`test-${crypto.randomUUID()}`)
  })
  afterEach(async () => database.delete())

  it('saves chunks in order and joins them into one file', async () => {
    const rec = await beginRecording('doc-1', 'audio/webm', database)
    await saveRecordingChunk(rec.id, 0, new Blob(['ab']), 10_000, database)
    await saveRecordingChunk(rec.id, 1, new Blob(['cd']), 20_000, database)
    await finishRecording(rec.id, 21_000, database)

    const [stored] = await recordingsForDoc('doc-1', database)
    expect(stored).toMatchObject({ chunks: 2, durationMs: 21_000, mimeType: 'audio/webm' })
    expect(stored.endedAt).toBeTruthy()
    const blob = await recordingBlob(stored, database)
    expect(blob.type).toBe('audio/webm')
    expect(await blob.text()).toBe('abcd')
  })

  it('deletes the audio of pages deleted for good, and only theirs', async () => {
    const a = await beginRecording('doc-a', 'audio/webm', database)
    const b = await beginRecording('doc-b', 'audio/webm', database)
    await saveRecordingChunk(a.id, 0, new Blob(['a']), 1, database)
    await saveRecordingChunk(b.id, 0, new Blob(['b']), 1, database)
    await deleteRecordingsForDocs(['doc-a'], database)
    expect(await recordingsForDoc('doc-a', database)).toEqual([])
    expect(await recordingsForDoc('doc-b', database)).toHaveLength(1)
    expect(await database.recordingChunks.count()).toBe(1)
  })
})
