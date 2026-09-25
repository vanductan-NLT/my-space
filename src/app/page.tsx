'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const mode = localStorage.getItem('my-space:last-mode')
    router.replace(mode === '/create' || mode === '/work' || mode === '/frame' ? mode : '/write')
  }, [router])
  return <main className="center-state"><div className="spinner" /></main>
}
