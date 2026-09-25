import { ImageResponse } from 'next/og'

// App icons for the browser tab, the install dialog and the home screen.
// Full-bleed square with the mark inside the maskable safe zone, so one image
// works both as a regular and as a maskable (Android adaptive) icon.

export function generateImageMetadata() {
  return [
    { id: '32', size: { width: 32, height: 32 }, contentType: 'image/png' },
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ]
}

export function renderMark(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: size * 0.1,
          background: '#99e5b7',
        }}
      >
        {/* The mascot's eyes, inside the maskable safe zone. */}
        <div style={{ width: size * 0.11, height: size * 0.26, borderRadius: size, background: '#0d1711' }} />
        <div style={{ width: size * 0.11, height: size * 0.26, borderRadius: size, background: '#0d1711' }} />
      </div>
    ),
    { width: size, height: size }
  )
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  return renderMark(Number(await id))
}
