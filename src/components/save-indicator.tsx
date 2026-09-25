'use client'

import type { SaveState } from '@/lib/models'
import { useI18n } from '@/lib/i18n'

/**
 * Saving is automatic, so nothing is shown while it works. Words appear only
 * when the user needs to act.
 */
export function SaveIndicator({ state, blocked = false }: { state: SaveState; blocked?: boolean }) {
  const { t } = useI18n()
  const problem = blocked ? t('Not saving') : state === 'error' ? t('Save failed') : null
  if (!problem) return null
  return (
    <div className="save-state" data-state="error" role="alert">
      {problem}
    </div>
  )
}
