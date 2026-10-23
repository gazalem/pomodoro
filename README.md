# Pomodoro

A focus timer that runs your whole workday. Focus blocks and breaks repeat on their own, stop for
lunch, and stop again at the end of the day. Every session is stored in a **SQLite database that
runs in your browser (WebAssembly)** and shown in a report next to your tasks.

- **No server, no account.** The app is a static site. Your data never leaves your device.
- **Works offline** after the first visit, and can be installed as an app on phone, tablet or desktop.
- Hosts anywhere that serves static files: **GitHub Pages**, Vercel, Netlify, S3, nginx.

## Getting started

Requires **Node.js 22.13+**.

```bash
pnpm install
pnpm dev                       # http://localhost:3000
```

| Script         | What it does                                                            |
| -------------- | ----------------------------------------------------------------------- |
| `pnpm dev`     | Dev server                                                              |
| `pnpm build`   | Static export to `out/` (set `NEXT_PUBLIC_BASE_PATH` for a sub-path)    |
| `pnpm preview` | Serves `out/` locally like a static host would                          |
| `pnpm test`    | Unit tests: timer engine and every SQL query (`node --test`)            |
| `pnpm lint`    | ESLint                                                                  |

Try the production build under a GitHub Pages-style sub-path:

```bash
NEXT_PUBLIC_BASE_PATH=/pomodoro pnpm build && NEXT_PUBLIC_BASE_PATH=/pomodoro pnpm preview
```

## How the day runs

Settings (gear icon) control focus/short/long break length, long-break interval, workday start/end,
lunch time and length, and daily goal. The settings sheet previews your day with the same engine
the timer uses, e.g. "8 focus blocks before lunch at 12:00 PM, 8 after".

- **Continuous cycle.** Focus → short break → … → long break every N blocks, with no clicks needed.
- **Lunch.** A phase that would run into lunch is shortened to end exactly at lunch start. Lunch then
  runs as its own phase, and focus resumes afterwards (or waits for you, if you turn that off).
  Starting inside the lunch window goes straight to lunch; **Skip** ends lunch early.
- **End of day.** The last phase is clipped to the end time and the cycle stops.
- **Accurate in the background.** The timer stores wall-clock end times, so throttled tabs, locked
  phones and sleeping laptops land on the right phase when they wake. Missed phases are still recorded.

Also: ambient sounds synthesized with Web Audio, a chime and optional notifications, and a screen
wake lock while running.

## Tasks & report

Add tasks with a pomodoro estimate and pick one before focusing. Give each task a **category**
(starts with Personal, Work, Assignments and Development; tap **Edit** next to the filter chips to add,
rename, recolor or delete up to 8). Filter the list by category; adding a task while a filter is on
files it under that category. Use the pencil button to edit a task's title or
estimate (Enter saves, Escape cancels). Drag the grip handle to reorder your to-do list; it works with mouse, touch, or keyboard (focus the handle, press Space, use the arrow keys, then Space). The **report** (chart icon) shows
focus time, pomodoros, days on goal, focus completion rate, tasks completed, per-day and per-hour
charts, focus time by category, estimate vs. actual per task, a session log, and **CSV export**.

## Your data

Data is stored with SQLite's **`opfs-sahpool`** VFS in the browser's Origin Private File System.
Unlike the plain `opfs` VFS, it doesn't need COOP/COEP headers, so it works on GitHub Pages.

- **Settings → Your data → Download backup** saves the raw `.sqlite3` file. **Restore** loads it on
  another device or browser. The backup also opens in any SQLite tool (`sqlite3`, DB Browser).
- Data is per browser and per site. Clearing site data deletes it, so keep backups.
- The app asks the browser for persistent storage so data isn't evicted under storage pressure.
- Where OPFS isn't available (e.g. Firefox private windows), the database runs in memory and is
  snapshotted to IndexedDB after each write. The settings sheet says which mode is active.
- Only one tab can own the database at a time (a Web Lock enforces this). A second tab shows a
  notice and takes over automatically when the first one closes.

## Architecture

```
app/
  page.tsx, report/page.tsx   Static pages; all data is loaded on the client
  manifest.ts, icon.svg       PWA install
components/
  app-gate.tsx                Opens the database, then renders the timer
  pomodoro-app.tsx            Timer screen; report-client.tsx / report-view.tsx for the report
lib/
  schedule.ts                 Pure timer engine + reducer (all scheduling rules)
  repo.ts                     Every SQL query, written against an async SqlDriver
  db/worker.ts                Web Worker that owns SQLite WASM (OPFS, or IndexedDB fallback)
  db/client.ts                Promise RPC to the worker (implements SqlDriver)
  db/browser.ts               One-tab lock, migrations, useDatabase() hook
  db/migrations.ts            Versioned schema (PRAGMA user_version)
public/sw.js                  Service worker for offline use
scripts/copy-sqlite-wasm.mjs  Copies the SQLite WASM runtime into public/ (run by dev/build)
tests/                        Engine tests + repo tests on node:sqlite via the same SqlDriver
```

**Why a worker:** OPFS's synchronous file handles are only available in workers, and running SQLite
there keeps the UI thread free. **Why copy the runtime to `public/`:** the sqlite-wasm package
creates internal workers from dynamic URLs that bundlers can't resolve, so it's loaded at runtime
from a versioned folder instead (`public/sqlite-wasm/` is gitignored and regenerated).

**Data flow.** The running timer lives in `localStorage`, so a reload continues it. Finished phases
go into an outbox and are written to SQLite with `INSERT OR IGNORE` on a client-generated ID, so
retries never double-count.

## Deployment

Push to `main` and **.github/workflows/deploy-pages.yml** publishes to GitHub Pages. See
[DEPLOYMENT.md](DEPLOYMENT.md) for setup and for other hosts.
