import { describe, expect, it } from 'vitest'
import { newDocument, type LocalDocument } from './models'
import { ancestorsOf, buildPageTree, canNest, descendantsOf, rootOf, trashGroupOf, trashRoots } from './page-tree'
import { moveToFolderPatches, nestPatches, pagesInFolder, restorePatches, trashPatches } from './page-tree-operations'

const page = (id: string, extra: Partial<LocalDocument> = {}, createdAt = `2026-10-0${id.length}T00:00:00.000Z`): LocalDocument => ({
  ...newDocument(id),
  id,
  createdAt,
  updatedAt: createdAt,
  ...extra,
})

// Home ─ Projects ─ Thesis ─ Chapter 1, plus a loose Inbox page.
const sample = () => [
  page('home', { folderId: 'f1' }),
  page('projects', { parentId: 'home', folderId: 'f1' }),
  page('thesis', { parentId: 'projects', folderId: 'f1' }),
  page('ch1', { parentId: 'thesis', folderId: 'f1' }),
  page('inbox'),
]

describe('building the page tree', () => {
  it('nests pages under their parents and keeps top-level pages in list order', () => {
    const tree = buildPageTree(sample())
    expect(tree.roots.map(d => d.id)).toEqual(['home', 'inbox'])
    expect(tree.children.get('home')?.map(d => d.id)).toEqual(['projects'])
    expect(ancestorsOf(tree, 'ch1').map(d => d.id)).toEqual(['home', 'projects', 'thesis'])
    expect(descendantsOf(tree, 'projects').map(d => d.id)).toEqual(['thesis', 'ch1'])
    expect(rootOf(tree, 'ch1')?.id).toBe('home')
  })

  it('lists sub-pages oldest first', () => {
    const tree = buildPageTree([page('p'), page('b', { parentId: 'p' }, '2026-10-02T00:00:00.000Z'), page('a', { parentId: 'p' }, '2026-10-01T00:00:00.000Z')])
    expect(tree.children.get('p')?.map(d => d.id)).toEqual(['a', 'b'])
  })

  it('shows a page whose parent is gone (deleted or in Trash) as a top-level page', () => {
    const tree = buildPageTree([page('orphan', { parentId: 'missing' }), page('self', { parentId: 'self' })])
    expect(tree.roots.map(d => d.id)).toEqual(['orphan', 'self'])
  })

  it('breaks a parent cycle from damaged data so every page stays reachable', () => {
    const tree = buildPageTree([page('a', { parentId: 'b' }), page('b', { parentId: 'c' }), page('c', { parentId: 'a' }), page('tail', { parentId: 'a' })])
    const reachable = tree.roots.flatMap(r => [r, ...descendantsOf(tree, r.id)]).map(d => d.id).sort()
    expect(reachable).toEqual(['a', 'b', 'c', 'tail'])
    expect(tree.roots).toHaveLength(1)
  })

  it('refuses to nest a page inside itself or its own sub-pages', () => {
    const tree = buildPageTree(sample())
    expect(canNest(tree, 'projects', 'projects')).toBe(false)
    expect(canNest(tree, 'projects', 'ch1')).toBe(false)
    expect(canNest(tree, 'ch1', 'projects')).toBe(true)
    expect(canNest(tree, 'inbox', 'thesis')).toBe(true)
  })
})

describe('moving pages', () => {
  it('nests a page with its sub-pages and files them in the new parent’s folder', () => {
    const tree = buildPageTree([...sample(), page('draft', { folderId: 'f2' }), page('notes', { parentId: 'draft', folderId: 'f2' })])
    expect(nestPatches(tree, 'draft', 'thesis')).toEqual([
      { id: 'draft', patch: { parentId: 'thesis', folderId: 'f1' } },
      { id: 'notes', patch: { folderId: 'f1' } },
    ])
    expect(nestPatches(tree, 'thesis', 'ch1')).toBeNull()
    expect(nestPatches(tree, 'ch1', 'thesis')).toBeNull() // already there
  })

  it('moving to a folder makes the page top-level and brings its sub-pages along', () => {
    const tree = buildPageTree(sample())
    expect(moveToFolderPatches(tree, 'thesis', 'f2')).toEqual([
      { id: 'thesis', patch: { parentId: undefined, folderId: 'f2' } },
      { id: 'ch1', patch: { folderId: 'f2' } },
    ])
  })

  it('counts every page of a folder, sub-pages included', () => {
    expect(pagesInFolder(buildPageTree(sample()), 'f1').map(d => d.id)).toEqual(['home', 'projects', 'thesis', 'ch1'])
  })
})

describe('Trash with nested pages', () => {
  const at = '2026-10-19T03:00:00.000Z'
  const trashed = () => {
    const docs = sample()
    const patches = new Map(trashPatches(buildPageTree(docs), 'projects', at).map(p => [p.id, p.patch]))
    return docs.map(d => ({ ...d, ...patches.get(d.id) }))
  }

  it('moves a page and all of its sub-pages to Trash with one timestamp', () => {
    const all = trashed()
    expect(all.filter(d => d.deletedAt === at).map(d => d.id)).toEqual(['projects', 'thesis', 'ch1'])
    expect(all.find(d => d.id === 'home')?.deletedAt).toBeUndefined()
  })

  it('lists one Trash entry for the group and restores it inside its live parent', () => {
    const all = trashed()
    const trash = all.filter(d => d.deletedAt)
    expect(trashRoots(trash).map(d => d.id)).toEqual(['projects'])
    expect(trashGroupOf(trash, trash[0]).map(d => d.id)).toEqual(['projects', 'thesis', 'ch1'])

    const patches = restorePatches(all, trash[0], () => true)
    expect(patches).toEqual([
      { id: 'projects', patch: { deletedAt: undefined, folderId: 'f1', parentId: 'home' } },
      { id: 'thesis', patch: { deletedAt: undefined, folderId: 'f1' } },
      { id: 'ch1', patch: { deletedAt: undefined, folderId: 'f1' } },
    ])
  })

  it('keeps a sub-page trashed earlier on its own as a separate entry', () => {
    const docs = sample().map(d => (d.id === 'ch1' ? { ...d, deletedAt: '2026-10-18T00:00:00.000Z' } : d))
    const later = new Map(trashPatches(buildPageTree(docs.filter(d => !d.deletedAt)), 'projects', at).map(p => [p.id, p.patch]))
    const all = docs.map(d => ({ ...d, ...later.get(d.id) }))
    const trash = all.filter(d => d.deletedAt)
    expect(trashRoots(trash).map(d => d.id).sort()).toEqual(['ch1', 'projects'])
    expect(trashGroupOf(trash, trash.find(d => d.id === 'projects')!).map(d => d.id)).toEqual(['projects', 'thesis'])
  })

  it('restores a page whose parent is still in Trash as a top-level page, dropping a deleted folder', () => {
    const all = trashed()
    const thesis = all.find(d => d.id === 'thesis')!
    const [first] = restorePatches(all, thesis, () => false)
    expect(first).toEqual({ id: 'thesis', patch: { deletedAt: undefined, folderId: undefined, parentId: undefined } })
  })
})
