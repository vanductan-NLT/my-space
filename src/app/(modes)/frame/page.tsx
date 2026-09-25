import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

export const metadata: Metadata = { title: 'Frame' }
const FrameStudio = dynamic(() => import('@/components/frame/frame-studio'), { loading: () => <div className="center-state"><div className="spinner" /></div> })
export default function FramePage() { return <FrameStudio /> }
