import type { SaveState } from '@/lib/models'

/**
 * Saving is automatic, so nothing is shown while it works. Words appear only
 * when the user needs to act.
 */
export function SaveIndicator({ state, blocked = false }: { state: SaveState; blocked?: boolean }) {
  const problem = blocked ? 'Not saving' : state === 'error' ? 'Save failed' : null
  if (!problem) return null
  return (
    <div className="save-state" data-state="error" role="alert">
      {problem}
    </div>
  )
}
