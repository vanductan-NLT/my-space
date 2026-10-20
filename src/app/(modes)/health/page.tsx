import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Health' }
// The workout log frame lives in the shared AppShell (like Work) so a workout in
// progress survives switching modes. This route only selects it.
export default function HealthPage() {
  return null
}
