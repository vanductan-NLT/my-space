import { db as defaultDb, type WorkspaceDB } from './db'
import type { LocalRecording } from './models'

/*
 * Meeting audio in IndexedDB. MediaRecorder hands over a chunk every few
 * seconds; each is saved straight away, so a closed tab or crash loses at most
 * the last few seconds. Chunks of one recording concatenate into a playable file.
 */

export async function beginRecording(docId: string, mimeType: string, database: WorkspaceDB = defaultDb): Promise<LocalRecording> {
  const recording: LocalRecording = { id: crypto.randomUUID(), docId, startedAt: new Date().toISOString(), durationMs: 0, mimeType, chunks: 0 }
  await database.recordings.add(recording)
  return recording
}

export async function saveRecordingChunk(recordingId: string, seq: number, blob: Blob, durationMs: number, database: WorkspaceDB = defaultDb) {
  await database.transaction('rw', database.recordings, database.recordingChunks, async () => {
    await database.recordingChunks.put({ recordingId, seq, blob })
    await database.recordings.update(recordingId, { chunks: seq + 1, durationMs })
  })
}

export async function finishRecording(recordingId: string, durationMs: number, database: WorkspaceDB = defaultDb) {
  await database.recordings.update(recordingId, { endedAt: new Date().toISOString(), durationMs })
}

export async function recordingsForDoc(docId: string, database: WorkspaceDB = defaultDb): Promise<LocalRecording[]> {
  return (await database.recordings.where('docId').equals(docId).toArray()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** The whole recording as one file, chunks in order. */
export async function recordingBlob(recording: LocalRecording, database: WorkspaceDB = defaultDb): Promise<Blob> {
  const chunks = await database.recordingChunks.where('recordingId').equals(recording.id).sortBy('seq')
  return new Blob(chunks.map(c => c.blob), { type: recording.mimeType })
}

/** Removes the audio of pages that are deleted for good. */
export async function deleteRecordingsForDocs(docIds: string[], database: WorkspaceDB = defaultDb) {
  if (!docIds.length) return
  await database.transaction('rw', database.recordings, database.recordingChunks, async () => {
    const recordings = await database.recordings.where('docId').anyOf(docIds).toArray()
    for (const r of recordings) await database.recordingChunks.where('recordingId').equals(r.id).delete()
    await database.recordings.bulkDelete(recordings.map(r => r.id))
  })
}
