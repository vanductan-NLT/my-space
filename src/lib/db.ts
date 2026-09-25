import Dexie, { type EntityTable } from 'dexie'
import type { Backup, LocalBoard, LocalDocument } from './models'

export class WorkspaceDB extends Dexie {
  documents!:EntityTable<LocalDocument,'id'>
  boards!:EntityTable<LocalBoard,'id'>
  constructor(name='my-space') { super(name); this.version(1).stores({ documents:'id,updatedAt,title',boards:'id,updatedAt,title' }) }
}
export const db = new WorkspaceDB()
export async function exportBackup():Promise<Backup>{ return {format:'my-space-backup',version:1,exportedAt:new Date().toISOString(),documents:await db.documents.toArray(),boards:await db.boards.toArray()} }
const validItem=(v:unknown)=>{ const i=v as {id?:unknown;title?:unknown;updatedAt?:unknown}|null; return !!i&&typeof i==='object'&&typeof i.id==='string'&&typeof i.title==='string'&&typeof i.updatedAt==='string' }
export function parseBackup(value:unknown):Backup { if(!value||typeof value!=='object'||(value as Partial<Backup>).format!=='my-space-backup')throw new Error('This file is not a My Space backup.');const data=value as Partial<Backup>;if(data.version!==1||!Array.isArray(data.documents)||!Array.isArray(data.boards))throw new Error('Unsupported or damaged backup file.');if(!data.documents.every(d=>validItem(d)&&!!d.content&&typeof d.content==='object')||!data.boards.every(validItem))throw new Error('This backup is damaged. Nothing was imported.');return data as Backup }

export type ImportResult = { added:number; updated:number; keptAsCopy:number }

/**
 * Restores a backup without destroying newer work: when an item already exists
 * locally with a newer edit, the local one is kept and the backup's version is
 * added beside it as a "(from backup)" copy.
 */
export async function importBackup(data:Backup, database:WorkspaceDB=db):Promise<ImportResult>{
  const result:ImportResult={added:0,updated:0,keptAsCopy:0}
  const merge=async<T extends LocalDocument|LocalBoard>(table:EntityTable<T,'id'>,items:T[])=>{
    for(const item of items){
      const local=await table.get(item.id as never)
      if(!local){result.added++;await table.put(item);continue}
      if(Date.parse(local.updatedAt)<=Date.parse(item.updatedAt)){result.updated++;await table.put(item);continue}
      result.keptAsCopy++
      await table.put({...item,id:crypto.randomUUID(),title:`${item.title} (from backup)`})
    }
  }
  await database.transaction('rw',database.documents,database.boards,async()=>{
    await merge(database.documents,data.documents)
    await merge(database.boards,data.boards)
  })
  return result
}
export function isQuotaError(error:unknown){ return error instanceof DOMException && (error.name==='QuotaExceededError'||error.name==='NS_ERROR_DOM_QUOTA_REACHED') }
