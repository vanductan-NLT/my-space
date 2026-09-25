import { AppShell } from '@/components/app-shell'

// One shell for all modes: it stays mounted while switching between Write,
// Create and Work, so navigation state and the Work iframe survive the switch.
export default function ModesLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
