import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-context'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'My Space', template: '%s · My Space' },
  description: 'A private, local-first workspace for writing, creating, and focused work.',
  appleWebApp: { capable: true, title: 'My Space', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#111111',
  colorScheme: 'dark light',
  // Lets the bottom nav sit above the iPhone home indicator (env(safe-area-inset-bottom)).
  viewportFit: 'cover',
}

// Runs before React: applies the saved theme before first paint (no flash of
// the wrong theme) and keeps the browser's install prompt if it fires early.
const bootScript = `
try {
  var t = localStorage.getItem('my-space:theme');
  if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
} catch (e) {}
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  window.dispatchEvent(new Event('pwainstallready'));
});
${process.env.NODE_ENV === 'production' ? "if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });" : ''}
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
