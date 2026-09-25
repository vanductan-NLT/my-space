import type { Metadata } from 'next'
import ChallengeWorkspace from '@/components/challenge/challenge-workspace'

export const metadata: Metadata = { title: 'Challenge' }

export default function ChallengePage() {
  return <ChallengeWorkspace />
}
