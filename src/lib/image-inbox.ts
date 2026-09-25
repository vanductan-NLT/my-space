/*
 * Hand an image from one mode to another (Create → Frame, Frame → Create)
 * during client-side navigation. Kept in memory only: modes share the page, so
 * a module variable survives the route change and nothing is written to disk.
 */

type Target = 'frame' | 'create'

const inbox: Partial<Record<Target, Blob>> = {}

export const sendImage = (target: Target, blob: Blob) => {
  inbox[target] = blob
}

export const takeImage = (target: Target): Blob | null => {
  const blob = inbox[target] ?? null
  delete inbox[target]
  return blob
}
