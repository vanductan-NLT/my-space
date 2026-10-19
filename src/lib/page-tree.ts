import type { LocalDocument } from './models'

/*
 * Nested pages: a page may name another live page as its `parentId`. These
 * helpers turn the flat document list into a tree and stay safe on damaged
 * data — a parent that is missing, in Trash, or part of a cycle is ignored, so
 * every page is always reachable from the root list.
 */

export type PageTree = {
  byId: Map<string, LocalDocument>
  /** Effective parent of each nested page (only valid, acyclic links). */
  parent: Map<string, string>
  /** Sub-pages of each page, oldest first so new sub-pages land at the bottom. */
  children: Map<string, LocalDocument[]>
  /** Pages with no effective parent, in the order of the input list. */
  roots: LocalDocument[]
}

export function buildPageTree(docs: LocalDocument[]): PageTree {
  const byId = new Map(docs.map(d => [d.id, d]))
  const parent = new Map<string, string>()
  for (const d of docs) if (d.parentId && d.parentId !== d.id && byId.has(d.parentId)) parent.set(d.id, d.parentId)

  // Break cycles: when walking up from a page leads back to it, that page becomes a root.
  for (const d of docs) {
    const seen = new Set<string>()
    let cur = parent.get(d.id)
    while (cur && !seen.has(cur)) {
      if (cur === d.id) {
        parent.delete(d.id)
        break
      }
      seen.add(cur)
      cur = parent.get(cur)
    }
  }

  const children = new Map<string, LocalDocument[]>()
  const roots: LocalDocument[] = []
  for (const d of docs) {
    const p = parent.get(d.id)
    if (!p) roots.push(d)
    else children.set(p, [...(children.get(p) ?? []), d])
  }
  for (const list of children.values()) list.sort((a, b) => (a.createdAt || a.updatedAt).localeCompare(b.createdAt || b.updatedAt))
  return { byId, parent, children, roots }
}

/** Ancestors of a page from the top-level page down to its direct parent. */
export function ancestorsOf(tree: PageTree, id: string): LocalDocument[] {
  const chain: LocalDocument[] = []
  let cur = tree.parent.get(id)
  while (cur) {
    const doc = tree.byId.get(cur)
    if (!doc) break
    chain.unshift(doc)
    cur = tree.parent.get(cur)
  }
  return chain
}

/** Every page below `id`, depth first. */
export function descendantsOf(tree: PageTree, id: string): LocalDocument[] {
  const out: LocalDocument[] = []
  const walk = (pid: string) => {
    for (const child of tree.children.get(pid) ?? []) {
      out.push(child)
      walk(child.id)
    }
  }
  walk(id)
  return out
}

/** The top-level page a page lives under (itself when it is top-level). */
export const rootOf = (tree: PageTree, id: string) => ancestorsOf(tree, id)[0] ?? tree.byId.get(id)

/** A page can't go inside itself or inside one of its own sub-pages. */
export function canNest(tree: PageTree, pageId: string, parentId: string): boolean {
  if (pageId === parentId || !tree.byId.has(pageId) || !tree.byId.has(parentId)) return false
  return !ancestorsOf(tree, parentId).some(a => a.id === pageId)
}

/**
 * Pages that went to Trash together with `doc`: the page itself plus its
 * trashed sub-pages carrying the same `deletedAt`. A sub-page trashed on its
 * own earlier keeps its own entry in Trash.
 */
export function trashGroupOf(trash: LocalDocument[], doc: LocalDocument): LocalDocument[] {
  const group = [doc]
  const ids = new Set([doc.id])
  let grew = true
  while (grew) {
    grew = false
    for (const d of trash) {
      if (!ids.has(d.id) && d.parentId && ids.has(d.parentId) && d.deletedAt === doc.deletedAt) {
        ids.add(d.id)
        group.push(d)
        grew = true
      }
    }
  }
  return group
}

/** Trash entries to list: pages not swept into Trash as part of a parent's group. */
export function trashRoots(trash: LocalDocument[]): LocalDocument[] {
  const byId = new Map(trash.map(d => [d.id, d]))
  return trash.filter(d => {
    const parent = d.parentId ? byId.get(d.parentId) : undefined
    return !parent || parent.id === d.id || parent.deletedAt !== d.deletedAt
  })
}
