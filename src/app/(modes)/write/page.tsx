import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

export const metadata:Metadata={title:'Write'}
const WritingWorkspace=dynamic(()=>import('@/components/write/writing-workspace'),{loading:()=> <div className="center-state"><div className="spinner"/></div>})
export default function WritePage(){return <WritingWorkspace/>}
