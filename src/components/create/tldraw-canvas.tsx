'use client'

import { getSnapshot, loadSnapshot, Tldraw, type Editor } from 'tldraw'
import { useEffect, useRef } from 'react'

export default function TldrawCanvas({
  snapshot,
  theme = 'dark',
  locale = 'en',
  onChange,
  onEditor,
  onLoadError,
}: {
  snapshot: unknown
  theme?: 'dark' | 'light'
  /** tldraw's own interface language (it ships a Vietnamese translation). */
  locale?: 'vi' | 'en'
  onChange: (snapshot: unknown) => void
  onEditor: (editor: Editor) => void
  onLoadError: () => void
}) {
  const unlisten = useRef<(() => void) | null>(null)
  const currentEditor = useRef<Editor | null>(null)

  useEffect(() => () => unlisten.current?.(), [])

  useEffect(() => {
    if (currentEditor.current) {
      currentEditor.current.user.updateUserPreferences({ colorScheme: theme, locale })
    }
  }, [theme, locale])

  return (
    <Tldraw
      licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      onMount={editor => {
        currentEditor.current = editor
        onEditor(editor)
        editor.user.updateUserPreferences({ colorScheme: theme, locale })
        if (snapshot) {
          try {
            loadSnapshot(editor.store, snapshot as Parameters<typeof loadSnapshot>[1])
          } catch {
            // Leave the stored original untouched; the workspace stops autosaving this board.
            onLoadError()
          }
        }
        unlisten.current = editor.store.listen(
          () => onChange(getSnapshot(editor.store)),
          { scope: 'document', source: 'user' }
        )
      }}
    />
  )
}
