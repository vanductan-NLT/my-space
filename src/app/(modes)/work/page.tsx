import type { Metadata } from 'next'

export const metadata:Metadata={title:'Work'}
// The TanFlow frame lives in the shared AppShell so it keeps running (timers,
// audio) while you switch to Write or Create. This route only selects it.
export default function WorkPage(){return null}
