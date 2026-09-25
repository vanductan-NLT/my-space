import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

export const metadata:Metadata={title:'Create'}
const CreativeWorkspace=dynamic(()=>import('@/components/create/creative-workspace'),{loading:()=> <div className="center-state"><div className="spinner"/></div>})
export default function CreatePage(){return <CreativeWorkspace/>}
