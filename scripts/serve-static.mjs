// Serves the static export in out/ the way GitHub Pages would, including the
// optional base path: `NEXT_PUBLIC_BASE_PATH=/pomodoro pnpm preview`.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve("out");
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function resolveFile(urlPath) {
  const file = path.join(root, decodeURIComponent(urlPath));
  if (!file.startsWith(root)) return null;
  try {
    const stat = statSync(file);
    if (stat.isDirectory()) return resolveFile(path.posix.join(urlPath, "index.html"));
    return file;
  } catch {
    return null;
  }
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (base && !pathname.startsWith(base)) {
    res.writeHead(302, { Location: `${base}/` }).end();
    return;
  }
  const file = resolveFile(pathname.slice(base.length) || "/");
  const status = file ? 200 : 404;
  const target = file ?? path.join(root, "404.html");
  // apple-icon is exported without an extension but is a PNG.
  const type = TYPES[path.extname(target)] ?? (target.endsWith("apple-icon") ? "image/png" : "application/octet-stream");
  res.writeHead(status, { "Content-Type": type });
  createReadStream(target).pipe(res);
}).listen(port, () => console.log(`Serving out/ at http://localhost:${port}${base}/`));
