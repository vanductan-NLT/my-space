# My Space

**Open source** — https://github.com/vanductan-NLT/my-space. Clone it, run it locally (see below) or open a pull request.

```bash
git clone https://github.com/vanductan-NLT/my-space.git
```

A calm, private workspace with three focused modes: a rich local-first writer, an infinite tldraw canvas, and the existing TanFlow work experience. There are no accounts, application servers, analytics, or content APIs. Documents and boards stay in the browser.

## Routes

- **`/write`** — Tiptap editor, local document library, autosave, search, backup/import, statistics, focus mode, and print-to-PDF.
- **`/create`** — official tldraw SDK with local board management, debounced IndexedDB snapshots, JSON import/export, and tldraw's native image/SVG/PNG tools.
- **`/work`** — responsive TanFlow iframe with loading, timeout/error, retry, and safe external-page fallback.
- **`/`** — client redirect to the last opened mode (or Write on first use).

## Architecture and privacy

Next.js App Router provides route-level splitting. The Tiptap editor and tldraw canvas are dynamically loaded only on their routes. Dexie owns a versioned IndexedDB database (`my-space`) with `documents` and `boards` tables. Small UI preferences and last-opened identifiers use `localStorage`. Persistence failures keep the current in-memory state visible and offer an immediate export path.

No document or board content is sent to this Next.js deployment, TanFlow, analytics, or AI services. TanFlow is a separate third-party page and only loads when Work mode is opened.

> Browser/site-data clearing deletes IndexedDB. Export backups regularly.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Quality checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_TANFLOW_URL` | No | TanFlow deployment; defaults to `https://tanflow.vercel.app/`. |
| `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` | **Production: verify** | Official tldraw SDK license key. Never commit the value. |

## Licensing and deployment gate

The app uses the official `tldraw` npm package, not copied source. tldraw's current SDK releases require compliance with their commercial/production terms; a valid production key may be required to remove the watermark and legally deploy. Review the terms for the exact installed version at [tldraw SDK licensing](https://tldraw.dev/community/license) and set `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` in Vercel. **Do not deploy to production until the owner has confirmed the applicable license and supplied a key when required.**

The build environment used for the initial implementation could not reach external hosts, so TanFlow's live `Content-Security-Policy` / `X-Frame-Options` headers could not be conclusively checked. Before production, run:

```bash
curl -sSIL https://tanflow.vercel.app/ | grep -Ei 'content-security-policy|x-frame-options'
```

If `frame-ancestors` or `X-Frame-Options` disallows this origin, change headers on the owned TanFlow deployment or use the included **Open TanFlow in new tab** fallback. Do not proxy or recreate TanFlow.

## Vercel

1. Import this repository in Vercel.
2. Add the environment variables above for Preview and Production.
3. Run all quality checks.
4. Confirm tldraw licensing and TanFlow iframe policy.
5. Deploy. No database or server storage is required.

## Data formats

Backups are explicit, versioned JSON (`format: "my-space-backup"`, `version: 1`). Board exports wrap a tldraw snapshot in `format: "my-space-board"`. Unknown or damaged backups are rejected without mutating IndexedDB. IndexedDB schema changes must add a new Dexie `version(...)` migration rather than editing version 1.

## Known limits

- Browser storage is origin- and profile-specific; private browsing may be ephemeral.
- Markdown/plain-text import intentionally favors safe text over perfect formatting. HTML export is available through the editor and PDF through browser print.
- iframe security failures cannot be observed reliably from cross-origin JavaScript; the timeout and external link are deliberate fallbacks.
- Word/Google Docs compatibility, cloud sync, collaboration, and AI features are out of scope.
