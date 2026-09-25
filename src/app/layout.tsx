import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-context'
import { I18nProvider } from '@/lib/i18n'
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

// Runs before React: applies the saved theme and accent colour before first
// paint (no flash) and keeps the browser's install prompt if it fires early.
const bootScript = `
try {
  var t = localStorage.getItem('my-space:theme');
  if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
  var l = localStorage.getItem('my-space:lang');
  document.documentElement.lang = l === 'vi' || l === 'en' ? l : (navigator.language || '').toLowerCase().indexOf('vi') === 0 ? 'vi' : 'en';
} catch (e) {}
try {
  var accent = localStorage.getItem('my-space:accent-css');
  if (accent) {
    var tag = document.createElement('style');
    tag.id = 'accent-style';
    tag.textContent = accent;
    document.head.appendChild(tag);
  }
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
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
