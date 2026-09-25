import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceDB, importBackup, parseBackup } from './db'
import { newBoard, newDocument, type LocalDocument } from './models'

describe('local workspace persistence',()=>{
 let database:WorkspaceDB
 beforeEach(()=>{database=new WorkspaceDB(`test-${crypto.randomUUID()}`)})
 afterEach(async()=>database.delete())
 it('creates, renames, duplicates and deletes documents',async()=>{const original=newDocument('Draft');await database.documents.add(original);await database.documents.update(original.id,{title:'Renamed'});const duplicate={...original,id:crypto.randomUUID(),title:'Renamed copy'};await database.documents.add(duplicate);expect((await database.documents.get(original.id))?.title).toBe('Renamed');expect(await database.documents.count()).toBe(2);await database.documents.delete(original.id);expect(await database.documents.toArray()).toEqual([duplicate])})
 it('saves and restores editor content',async()=>{const document=newDocument();document.content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Still here'}]}]};await database.documents.put(document);expect((await database.documents.get(document.id))?.content).toEqual(document.content)})
 it('creates and restores a board snapshot',async()=>{const board=newBoard('Map');board.snapshot={store:{'shape:1':{typeName:'shape'}}};await database.boards.put(board);expect((await database.boards.get(board.id))?.snapshot).toEqual(board.snapshot)})
})
describe('backup validation',()=>{it('accepts a versioned backup',()=>{const backup={format:'my-space-backup' as const,version:1 as const,exportedAt:new Date().toISOString(),documents:[],boards:[]};expect(parseBackup(backup)).toEqual(backup)});it('rejects invalid imports',()=>expect(()=>parseBackup({documents:[]})).toThrow(/not a My Space backup/))})
describe('backup restore',()=>{
 let database:WorkspaceDB
 beforeEach(()=>{database=new WorkspaceDB(`test-${crypto.randomUUID()}`)})
 afterEach(async()=>database.delete())
 const backupOf=(documents:LocalDocument[])=>({format:'my-space-backup' as const,version:1 as const,exportedAt:new Date().toISOString(),documents,boards:[]})
 it('never overwrites a newer local edit; the older backup version becomes a copy',async()=>{const local={...newDocument('Plan'),updatedAt:'2026-09-25T10:00:00.000Z'};await database.documents.put(local);const old={...local,title:'Plan',content:{type:'doc',content:[]},updatedAt:'2026-09-20T10:00:00.000Z'};const r=await importBackup(backupOf([old]),database);expect(r).toEqual({added:0,updated:0,keptAsCopy:1});expect(await database.documents.get(local.id)).toEqual(local);expect((await database.documents.toArray()).map(d=>d.title).sort()).toEqual(['Plan','Plan (from backup)'])})
 it('restores newer and missing items',async()=>{const local={...newDocument('A'),updatedAt:'2026-09-20T10:00:00.000Z'};await database.documents.put(local);const newer={...local,title:'A2',updatedAt:'2026-09-25T10:00:00.000Z'};const r=await importBackup(backupOf([newer,newDocument('B')]),database);expect(r).toEqual({added:1,updated:1,keptAsCopy:0});expect((await database.documents.get(local.id))?.title).toBe('A2')})
 it('rejects a backup with damaged items',()=>expect(()=>parseBackup(backupOf([{id:'x'} as unknown as LocalDocument]))).toThrow(/damaged/))
})
