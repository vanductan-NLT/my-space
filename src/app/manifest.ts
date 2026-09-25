import type { MetadataRoute } from 'next'

// Makes My Space installable ("Install My Space" in Chrome/Edge, "Add to Home
// Screen" on phones). Everything stays local-first; this only changes how the
// app opens.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Space',
    short_name: 'My Space',
    description: 'A private, local-first workspace for writing, creating, and focused work.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#111111',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Write', url: '/write' },
      { name: 'Create', url: '/create' },
      { name: 'Work', url: '/work' },
    ],
  }
}
