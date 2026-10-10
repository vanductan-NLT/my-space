import type { JSONContent } from '@tiptap/react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
/** `font`: page font id (see components/write/fonts.ts); absent = default. */
export type LocalDocument = { id:string; title:string; content:JSONContent; font?:string; createdAt:string; updatedAt:string; version:1; folderId?:string; isPinned?:boolean }
export type LocalBoard = { id:string; title:string; snapshot:unknown; preview?:string; createdAt:string; updatedAt:string; version:1 }
export type LocalFolder = { id:string; title:string; createdAt:string; updatedAt:string; version:1 }
export type Backup = { format:'my-space-backup'; version:1; exportedAt:string; documents:LocalDocument[]; boards:LocalBoard[]; folders?:LocalFolder[] }
export const EMPTY_CONTENT: JSONContent = { type:'doc', content:[{ type:'paragraph' }] }
export const newDocument = (title='Untitled document'):LocalDocument => { const now=new Date().toISOString(); return { id:crypto.randomUUID(),title,content:EMPTY_CONTENT,createdAt:now,updatedAt:now,version:1 } }
export const newBoard = (title='Untitled board'):LocalBoard => { const now=new Date().toISOString(); return { id:crypto.randomUUID(),title,snapshot:null,createdAt:now,updatedAt:now,version:1 } }
export const newFolder = (title='New folder'):LocalFolder => { const now=new Date().toISOString(); return { id:crypto.randomUUID(),title,createdAt:now,updatedAt:now,version:1 } }
