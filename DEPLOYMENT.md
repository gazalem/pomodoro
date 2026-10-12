# Deploying Pomodoro

The app has two parts that affect where it can run:

1. **A Node.js server.** The timer page, the report and the `/api/*` route handlers run on the
   server (`next start`).
2. **A SQLite file** at `data/pomodoro.db` (or `POMODORO_DB_PATH`). It needs a **persistent, writable
   disk**, or your history disappears.

| Platform      | Runs as-is? | What you need to change |
| ------------- | ----------- | ----------------------- |
| GitHub Pages  | ❌ No        | Static hosting only, so no server and no database. Needs a rewrite or a separate backend (see below). |
| Vercel        | ⚠️ Code yes, data no | Serverless functions have no persistent disk. Use a hosted database (Turso/libSQL recommended). |
| Heroku        | ⚠️ Code yes, data no | Dyno disks are wiped on every restart/deploy (at least daily). Use a hosted database. |
| Render / Fly.io / Railway / a VPS / Docker | ✅ Yes | Attach a persistent volume and point `POMODORO_DB_PATH` at it. |

If you want to keep SQLite exactly as it is, choose a host with a persistent volume (last row).

---

## Vercel

### 1. Push the repo to GitHub

```bash
gh repo create pomodoro --private --source . --push
```

### 2. Import the project

1. Open https://vercel.com/new and import the repository.
2. Vercel detects **Next.js** and **pnpm** (from `pnpm-lock.yaml`), so no build settings are needed.
3. **Settings → General → Node.js Version:** choose **22.x or newer**. `node:sqlite` needs 22.13+.

You can also deploy from the CLI:

```bash
pnpm dlx vercel        # first time: links the project, creates a preview deployment
pnpm dlx vercel --prod # production
```

### 3. Choose the database

Vercel's filesystem is read-only, except for `/tmp`, which is per-instance and temporary.

- **Demo only (data is lost):** add the environment variable `POMODORO_DB_PATH=/tmp/pomodoro.db`.
  The app starts and works, but sessions disappear on cold starts and differ between instances.
- **Real data: use Turso (hosted libSQL, SQLite-compatible).**
  1. Create a database: `turso db create pomodoro`, then `turso db tokens create pomodoro`.
  2. In Vercel, add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as environment variables.
  3. `pnpm add @libsql/client`, then change `lib/db.ts` / `lib/repo.ts` to use the libSQL client.
     Its API is async (`await db.execute(...)`), so the repo functions become `async`, and the route
     handlers and pages that call them gain an `await`. The SQL schema and queries stay the same.

Vercel Postgres/Neon also works but means rewriting the SQL for Postgres. Turso is the smaller change.

---

## Heroku

### 1. Add a Procfile and pin Node

```bash
echo "web: pnpm start" > Procfile
```

`next start` reads Heroku's `$PORT` automatically. `package.json` already declares
`"engines": { "node": ">=22.13" }` and `"packageManager"`, which the Node buildpack uses to choose
Node and pnpm.

### 2. Create the app and deploy

```bash
heroku login
heroku create my-pomodoro
heroku buildpacks:set heroku/nodejs
git push heroku main
heroku open
```

### 3. Choose the database

Heroku's dyno filesystem is **ephemeral**. Writes to `data/pomodoro.db` survive until the next
restart, deploy or daily cycle, then they're gone. For real use:

- **Turso**: the same changes as in the Vercel section. Set the variables with
  `heroku config:set TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=...`.
- **Heroku Postgres** (`heroku addons:create heroku-postgresql:essential-0`): requires porting the
  SQL from SQLite to Postgres (e.g. `INSERT OR IGNORE` becomes `ON CONFLICT DO NOTHING`, and `COUNT(*)
  FILTER` already works).

---

## GitHub Pages

GitHub Pages serves **static files only**. This app needs a server for:

- `/api/sessions`, `/api/tasks`, `/api/settings`, `/api/stats` and `/api/report/export`
  (POST/PATCH/DELETE handlers and request-dependent GETs aren't supported in a static export)
- the timer page and report, which read SQLite on each request
- the SQLite database itself

`output: "export"` will fail the build with the current code. There are two ways forward:

**Option A: split hosting.** Put the frontend on Pages and the API elsewhere.
Deploy the full app to Vercel/Heroku/Render as the API, then build a static export of the UI that
calls that API's URL (CORS headers are needed on the route handlers, and the report page must fetch
its data on the client). It's two deployments to keep in sync, so this is rarely worth it compared
with hosting everything on Vercel.

**Option B: make it fully client-side (offline-first).**
Move storage into the browser (IndexedDB, or SQLite in the browser via `sql.js` / SQLite WASM + OPFS),
turn the report into a client component, delete `app/api`, then:

```ts
// next.config.ts
const nextConfig = {
  output: "export",
  basePath: "/pomodoro",      // the repo name, for https://<user>.github.io/pomodoro
  images: { unoptimized: true },
};
```

Deploy with GitHub Actions (Settings → Pages → Source: **GitHub Actions**) using the official
`actions/upload-pages-artifact` + `actions/deploy-pages` steps on the `out/` folder.
The trade-off is that data stays on one device and browser, with no syncing between your phone
and laptop.

---

## Recommended: a host with a persistent disk (SQLite unchanged)

The simplest production setup for this codebase. Example for **Render**:

1. New → **Web Service** → connect the repo.
2. Build command: `pnpm install --frozen-lockfile && pnpm build`. Start command: `pnpm start`.
3. Add a **Disk** mounted at `/var/data` and set `POMODORO_DB_PATH=/var/data/pomodoro.db`.

Fly.io (`fly volumes create`), Railway (Volumes), or any VPS/Docker host with a mounted volume work
the same way. Run **one instance**, since SQLite is a single-writer local file.

## Before going public

The app has no authentication and is single-user. Before exposing it on the internet, add auth
(e.g. Auth.js or Clerk) or put it behind your platform's access protection (Vercel Deployment
Protection, Cloudflare Access, basic auth). Otherwise anyone with the URL can read and edit your data.
