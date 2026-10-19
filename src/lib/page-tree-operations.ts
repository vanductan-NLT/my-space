import type { LocalDocument } from './models'
import { canNest, descendantsOf, rootOf, trashGroupOf, type PageTree } from './page-tree'

/*
 * Page moves as plain lists of document patches, so the rules can be tested
 * without a database. Invariant kept by every move: a sub-page carries the
 * same `folderId` as its top-level page, so folder filters (count, delete
 * with pages) see whole subtrees. A patch value of `undefined` removes the
 * field when applied with Dexie's `update`.
 */

export type DocPatch = { id: string; patch: Partial<Pick<LocalDocument, 'parentId' | 'folderId' | 'deletedAt'>> }

const withFolder = (docs: LocalDocument[], folderId: string | undefined): DocPatch[] => docs.map(d => ({ id: d.id, patch: { folderId } }))

/** Puts a page (with its sub-pages) inside another page; null when not allowed or already there. */
export function nestPatches(tree: PageTree, docId: string, parentId: string): DocPatch[] | null {
  if (!canNest(tree, docId, parentId) || tree.parent.get(docId) === parentId) return null
  const folderId = rootOf(tree, parentId)?.folderId
  return [{ id: docId, patch: { parentId, folderId } }, ...withFolder(descendantsOf(tree, docId), folderId)]
}

/** Makes a page top-level in `folderId` (or in Pages when absent), bringing its sub-pages along. */
export function moveToFolderPatches(tree: PageTree, docId: string, folderId?: string): DocPatch[] {
  return [{ id: docId, patch: { parentId: undefined, folderId } }, ...withFolder(descendantsOf(tree, docId), folderId)]
}

/** Every page in a folder: its top-level pages and all of their sub-pages. */
export function pagesInFolder(tree: PageTree, folderId: string): LocalDocument[] {
  return tree.roots.filter(d => d.folderId === folderId).flatMap(d => [d, ...descendantsOf(tree, d.id)])
}

/** Trashing a page trashes its sub-pages too, with one shared timestamp so they come back together. */
export function trashPatches(tree: PageTree, docId: string, deletedAt: string): DocPatch[] {
  return [docId, ...descendantsOf(tree, docId).map(d => d.id)].map(id => ({ id, patch: { deletedAt } }))
}

/**
 * Restores a Trash entry and the sub-pages trashed with it. The page goes back
 * inside its parent when that parent is live; otherwise it returns as a
 * top-level page, in its old folder if that still exists.
 */
export function restorePatches(all: LocalDocument[], doc: LocalDocument, folderExists: (id: string) => boolean): DocPatch[] {
  const group = trashGroupOf(all.filter(d => d.deletedAt), doc)
  const parent = doc.parentId ? all.find(d => d.id === doc.parentId && !d.deletedAt) : undefined
  const folderId = parent ? parent.folderId : doc.folderId && folderExists(doc.folderId) ? doc.folderId : undefined
  return group.map(d => ({
    id: d.id,
    patch: d.id === doc.id ? { deletedAt: undefined, folderId, parentId: parent?.id } : { deletedAt: undefined, folderId },
  }))
}
