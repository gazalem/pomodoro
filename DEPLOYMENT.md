# Deploying Pomodoro

Pomodoro is a **fully static site**. `pnpm build` writes plain HTML, JS, CSS and the SQLite WASM
runtime to `out/`. There's no server code and no database server: each user's data lives in
SQLite inside their own browser. Any static host works, and nothing needs special headers.

| Platform     | Setup                                             | Base path                      |
| ------------ | ------------------------------------------------- | ------------------------------ |
| GitHub Pages | Included workflow, enable Pages once              | `/<repo>` (set automatically)  |
| Vercel       | Import the repo; zero config                      | none                           |
| Netlify / Cloudflare Pages | Build `pnpm build`, publish `out`   | none                           |
| Heroku       | Possible, but a static host is a better fit       | none                           |

`NEXT_PUBLIC_BASE_PATH` is only needed when the site is served from a sub-folder, as with GitHub
project pages at `https://<user>.github.io/<repo>/`.

---

## GitHub Pages (recommended)

The repo includes `.github/workflows/deploy-pages.yml`. It lints, runs the tests, builds with the
right base path, and deploys on every push to `main`.

1. Create the GitHub repo and push:
   ```bash
   gh repo create pomodoro --public --source . --push
   ```
2. In the repo on GitHub, go to **Settings → Pages → Build and deployment → Source:** choose
   **GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). The site is published at
   `https://<user>.github.io/pomodoro/`.

Notes:
- For a `<user>.github.io` repo the workflow builds with no base path automatically. For a
  **custom domain**, set `NEXT_PUBLIC_BASE_PATH: ""` in the workflow and add the domain under
  Settings → Pages.
- `public/.nojekyll` stops Jekyll from hiding the `_next/` folder if you ever publish by branch
  instead of Actions.
- GitHub Pages on a **private** repo requires a paid plan (Pro/Team/Enterprise).

## Vercel

1. Import the repo at https://vercel.com/new. Vercel detects Next.js and pnpm, and sees
   `output: "export"`, so it deploys the static files.
2. Leave `NEXT_PUBLIC_BASE_PATH` unset.

From the CLI:
```bash
pnpm dlx vercel --prod
```

## Netlify / Cloudflare Pages / S3 / nginx

Build command `pnpm build`, publish directory `out`. For your own web server, copy `out/` to the
web root. Make sure `.wasm` is served as `application/wasm` and `.mjs` as `text/javascript`; most
servers already do.

## Heroku

Heroku runs processes, not static sites, so it's the least natural fit. If you need it anyway:

```bash
echo "web: pnpm preview" > Procfile
```
```bash
heroku create my-pomodoro
```
```bash
git push heroku main
```

The Node buildpack runs `pnpm build` (the `build` script), and `pnpm preview` serves `out/` on
Heroku's `$PORT`.

---

## Things to know

- **Data is per device and per browser.** Moving from laptop to phone means Settings → Your data →
  Download backup on one, Restore on the other. Nothing syncs automatically.
- **Updates.** The service worker loads pages network-first, so a new deploy shows up on the next
  visit while online. Build assets and the versioned SQLite runtime are cached permanently.
- **Testing locally like production:**
  ```bash
  NEXT_PUBLIC_BASE_PATH=/pomodoro pnpm build && NEXT_PUBLIC_BASE_PATH=/pomodoro pnpm preview
  ```
  Then open http://localhost:4173/pomodoro/.
