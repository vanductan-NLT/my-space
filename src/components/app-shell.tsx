'use client'

import { Aperture, Brush, ChevronLeft, ChevronRight, FileText, PanelsTopLeft, Settings } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FloatingMascot, MascotLogo } from './mascot'
import { SettingsSheet } from './settings-sheet'
import { useI18n } from '@/lib/i18n'

const WorkWorkspace = dynamic(() => import('./work/work-workspace'))

const modes = [
  { href: '/write', label: 'Write', icon: FileText, shortcut: '1' },
  { href: '/create', label: 'Create', icon: Brush, shortcut: '2' },
  { href: '/work', label: 'Work', icon: PanelsTopLeft, shortcut: '3' },
  { href: '/frame', label: 'Frame', icon: Aperture, shortcut: '4' },
] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [modKey, setModKey] = useState('Ctrl+')
  const onWork = pathname === '/work'
  // TanFlow is loaded the first time Work is opened, then kept alive while
  // other modes are shown so a running timer is not reset.
  const [workOpened, setWorkOpened] = useState(onWork)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Shown unless turned off in Settings (read after mount: localStorage is client-only).
  const [mascotOn, setMascotOn] = useState(false)

  useEffect(() => {
    try {
      setMascotOn(localStorage.getItem('my-space:mascot-hidden') !== '1')
    } catch {
      setMascotOn(true)
    }
  }, [])

  const changeMascot = (on: boolean) => {
    setMascotOn(on)
    try {
      localStorage.setItem('my-space:mascot-hidden', on ? '0' : '1')
    } catch {}
  }

  // Tab title in the interface language (the server renders it in English).
  useEffect(() => {
    const mode = modes.find(m => m.href === pathname)
    if (mode) document.title = `${t(mode.label)} · My Space`
  }, [pathname, t])

  useEffect(() => {
    localStorage.setItem('my-space:last-mode', pathname)
    if (pathname === '/work') setWorkOpened(true)
  }, [pathname])

  useEffect(() => {
    setExpanded(localStorage.getItem('my-space:rail') === 'expanded')
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setModKey('⌘')
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        const target = modes[Number(e.key) - 1]
        if (target) router.push(target.href)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [router])

  const toggleRail = () => {
    setExpanded(v => {
      const next = !v
      localStorage.setItem('my-space:rail', next ? 'expanded' : 'collapsed')
      return next
    })
  }

  const navLinks = modes.map(({ href, label, icon: Icon, shortcut }) => {
    const isActive = pathname === href
    return (
      <Link
        key={href}
        className={`nav-link ${isActive ? 'active' : ''}`}
        href={href}
        aria-current={isActive ? 'page' : undefined}
        title={`${t(label)} (${modKey}${shortcut})`}
      >
        <Icon size={20} />
        <span className="nav-label">{t(label)}</span>
      </Link>
    )
  })

  return (
    <div className={`app-shell ${expanded ? 'rail-expanded' : ''}`}>
      <aside className={`rail ${expanded ? 'expanded' : ''}`} aria-label={t('Workspace navigation')}>
        {/* Not a link: "/" is outside this layout, so it reloaded the shell (and TanFlow). */}
        <div className="brand">
          <span className="brand-mark">
            <MascotLogo />
          </span>
          <span className="brand-name">My Space</span>
        </div>

        <nav className="rail-nav">{navLinks}</nav>

        <div className="rail-footer">
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title={t('Settings')} aria-label={t('Settings')} aria-haspopup="dialog">
            <Settings size={19} />
            <span className="footer-label">{t('Settings')}</span>
          </button>

          <button
            className="icon-button"
            onClick={toggleRail}
            title={t(expanded ? 'Collapse navigation' : 'Expand navigation')}
            aria-label={t(expanded ? 'Collapse navigation' : 'Expand navigation')}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronLeft size={19} /> : <ChevronRight size={19} />}
            <span className="footer-label">{t('Collapse')}</span>
          </button>
        </div>
      </aside>

      {/* Phones: the three modes, then Settings (theme, install, mascot) — kept apart from the modes. */}
      <nav className="mobile-nav" aria-label={t('Workspace navigation')}>
        {navLinks}
        <button type="button" className="nav-link settings-tab" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
          <Settings size={20} />
          <span className="nav-label">{t('Settings')}</span>
        </button>
      </nav>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} mascotOn={mascotOn} onMascotChange={changeMascot} />
      {mascotOn && <FloatingMascot />}

      <main className="workspace">
        {children}
        {workOpened && (
          <div className="work-host" hidden={!onWork}>
            <WorkWorkspace />
          </div>
        )}
      </main>
    </div>
  )
}
