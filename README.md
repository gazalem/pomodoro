# Pomodoro

A focus timer that runs your whole workday: focus blocks and breaks repeat on their own, stop for
lunch, and stop again at the end of the day. Every session is stored in SQLite and shown in a report
next to your tasks.

Runs on desktop, tablet and phone browsers. It can also be installed as an app (PWA) from the
browser's "Install" or "Add to Home Screen" menu.

## Getting started

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`, so there are no native modules to compile).

```bash
pnpm install
pnpm dev          # http://localhost:3000 (the Network URL works from a phone on the same Wi-Fi)
```

| Script       | What it does                                        |
| ------------ | --------------------------------------------------- |
| `pnpm dev`   | Dev server                                          |
| `pnpm build` | Production build (`pnpm start` to serve it)         |
| `pnpm test`  | Unit tests for the scheduling engine (`node --test`) |
| `pnpm lint`  | ESLint                                              |

The database is created on first request at `data/pomodoro.db` (gitignored). Set `POMODORO_DB_PATH`
to put it somewhere else.

## How the day runs

Settings (gear icon) control focus/short/long break length, long-break interval, workday start/end,
lunch time and length, and daily goal. The settings sheet previews your day with the same engine
the timer uses, e.g. "8 focus blocks before lunch at 12:00 PM, 8 after".

- **Continuous cycle.** Focus → short break → … → long break every N blocks, with no clicks needed.
- **Lunch.** A phase that would run into lunch is shortened to end exactly at lunch start. Lunch then
  runs as its own phase, and focus resumes afterwards (or waits for you, if you turn that off).
  Starting inside the lunch window goes straight to lunch; **Skip** ends lunch early.
- **End of day.** The last phase is clipped to the end time and the cycle stops. Starting it again
  after hours is allowed (overtime is not clipped).
- **Optional auto-start** at the workday start time while the app is open.
- **Accurate in the background.** The timer stores wall-clock end times, not a countdown, so throttled
  tabs, phone lock screens and sleeping laptops land on the right phase when they wake. Missed
  phases are completed and recorded. The cycle never carries over past midnight.

Other features: ambient sounds (ocean, fire, rain, nature birds) synthesized with Web Audio (no
audio files) that play during focus; a chime and optional system notifications when a phase ends;
and a screen wake lock while running.

## Tasks & report

Add tasks with a pomodoro estimate and pick one before focusing. Each completed focus block counts
toward that task. The **report** (chart icon) covers any date range:

- focus time, pomodoros, days that hit your goal, focus completion rate (finished vs. stopped or
  skipped), tasks completed, break time
- pomodoros per day against your goal, and your most productive hours
- per-task spent vs. estimate, a session log, and **CSV export**

## Architecture

```
app/
  page.tsx                 Timer screen: static shell + SQLite data streamed in (Cache Components)
  report/page.tsx          Report (server component; reads SQLite directly)
  api/settings             GET / PUT settings
  api/tasks, tasks/[id]    Task CRUD
  api/sessions             POST finished phases (idempotent on clientId)
  api/stats                Today's totals for the header
  api/report/export        CSV
  manifest.ts, icon.svg    PWA install
components/                Client UI (timer ring, sound tiles, task panel, settings, chart)
lib/
  schedule.ts              Pure timer engine + reducer (all scheduling rules live here)
  db.ts                    node:sqlite connection, WAL, versioned migrations
  repo.ts                  Queries and input validation
  ambient.ts               Web Audio soundscapes and chime
tests/schedule.test.ts     Engine tests: cycle, lunch clipping, catch-up, day end, pause/skip
```

**Where state lives.** Each device stores the running timer in `localStorage`, so a reload or a
closed lid picks up where it left off. Finished phases are added to an outbox in that state and
POSTed to `/api/sessions`. Failed POSTs are retried, and the server ignores duplicates, so nothing is
lost or counted twice while offline. Settings, tasks and sessions live in SQLite.

**Time zones.** The client records each session's local date and hour, so per-day and per-hour charts
use your local time. The report's default range, and the times in its session log, use the server's
clock, which is correct when the server runs on your own machine.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel, Heroku, GitHub Pages and persistent-disk hosts.

## Limitations / next steps

- **Single user, no auth.** Add authentication before exposing it beyond your machine or LAN, and
  add a `user_id` column to tasks/sessions/settings.
- **Serverless hosts** (e.g. Vercel) don't keep a local SQLite file. Self-host with `pnpm build &&
  pnpm start` (or a container with a volume for `data/`), or swap `lib/db.ts` for libSQL/Turso.
- The running timer isn't synced between devices; a timer started on the laptop isn't visible on
  the phone. Storing the timer state server-side would make that possible.
- No offline service worker yet; the app needs the server to load.
