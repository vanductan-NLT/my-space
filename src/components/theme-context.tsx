'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light'
/** What the user picked: a fixed theme, or follow the device. */
export type ThemeChoice = Theme | 'system'

interface ThemeContextType {
  theme: Theme
  choice: ThemeChoice
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setChoice: (choice: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  choice: 'system',
  toggleTheme: () => {},
  setTheme: () => {},
  setChoice: () => {},
})

const KEY = 'my-space:theme'
const systemTheme = (): Theme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

const applyToDOM = (next: Theme) => {
  document.documentElement.setAttribute('data-theme', next)
  document.documentElement.style.colorScheme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#111111' : '#f4f6f5')
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [choice, setChoiceState] = useState<ThemeChoice>('system')

  useEffect(() => {
    const saved = localStorage.getItem(KEY)
    const initialChoice: ThemeChoice = saved === 'dark' || saved === 'light' ? saved : 'system'
    const initial = initialChoice === 'system' ? systemTheme() : initialChoice
    setChoiceState(initialChoice)
    setThemeState(initial)
    applyToDOM(initial)
  }, [])

  // While following the device, switch when the device does.
  useEffect(() => {
    if (choice !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next = systemTheme()
      setThemeState(next)
      applyToDOM(next)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [choice])

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next)
    const resolved = next === 'system' ? systemTheme() : next
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {}
    setThemeState(resolved)
    applyToDOM(resolved)
  }, [])

  const setTheme = useCallback((next: Theme) => setChoice(next), [setChoice])

  const toggleTheme = useCallback(() => setChoice(theme === 'dark' ? 'light' : 'dark'), [setChoice, theme])

  return (
    <ThemeContext.Provider value={{ theme, choice, toggleTheme, setTheme, setChoice }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
