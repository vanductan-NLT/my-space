import type { JSONContent } from '@tiptap/react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
/**
 * `font`: page font id (see components/write/fonts.ts); absent = default.
 * `icon`: emoji shown before the title. `fullWidth`: page uses the whole editor width.
 * `deletedAt`: set while the document sits in Trash; absent = live document.
 * `parentId`: the page this page is nested inside; absent = top-level page. Not
 * indexed: the whole list is in memory, so the tree is built there (lib/page-tree.ts).
 */
export type LocalDocument = { id:string; title:string; icon?:string; content:JSONContent; font?:string; createdAt:string; updatedAt:string; version:1; folderId?:string; isPinned?:boolean; fullWidth?:boolean; deletedAt?:string; parentId?:string }
export type LocalBoard = { id:string; title:string; snapshot:unknown; preview?:string; createdAt:string; updatedAt:string; version:1 }
export type LocalFolder = { id:string; title:string; icon?:string; color?:string; createdAt:string; updatedAt:string; version:1 }
/**
 * Audio of a recorded meeting, kept beside the transcript page (`docId`).
 * The sound itself is stored as ordered `RecordingChunk`s; backups leave audio out.
 */
export type LocalRecording = { id:string; docId:string; startedAt:string; endedAt?:string; durationMs:number; mimeType:string; chunks:number }
export type RecordingChunk = { recordingId:string; seq:number; blob:Blob }
export type Backup = { format:'my-space-backup'; version:1; exportedAt:string; documents:LocalDocument[]; boards:LocalBoard[]; folders?:LocalFolder[] }
export const EMPTY_CONTENT: JSONContent = { type:'doc', content:[{ type:'paragraph' }] }
export const newDocument = (title='Untitled document', icon?:string):LocalDocument => { const now=new Date().toISOString(); return { id:crypto.randomUUID(),title,icon,content:EMPTY_CONTENT,createdAt:now,updatedAt:now,version:1 } }
export const newBoard = (title='Untitled board'):LocalBoard => { const now=new Date().toISOString(); return { id:crypto.randomUUID(),title,snapshot:null,createdAt:now,updatedAt:now,version:1 } }
export const newFolder = (title='New folder', icon?:string, color?:string):LocalFolder => { const now=new Date().toISOString(); return { id:crypto.randomUUID(),title,icon,color,createdAt:now,updatedAt:now,version:1 } }
