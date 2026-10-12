// Copies the SQLite WASM runtime into public/ so the database worker can load
// it at runtime instead of bundling it (its internal `new Worker(new URL(...))`
// calls can't be resolved by Turbopack). The folder is versioned so the
// service worker can cache it forever.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgJson = require.resolve("@sqlite.org/sqlite-wasm/package.json");
const { version } = JSON.parse(readFileSync(pkgJson, "utf8"));
const dist = path.join(path.dirname(pkgJson), "dist");
const root = path.join(process.cwd(), "public", "sqlite-wasm");
const target = path.join(root, version);

if (!existsSync(path.join(target, "sqlite3.wasm"))) {
  rmSync(root, { recursive: true, force: true }); // drop older versions
  mkdirSync(target, { recursive: true });
  for (const file of ["index.mjs", "sqlite3.wasm", "sqlite3-opfs-async-proxy.js"]) {
    cpSync(path.join(dist, file), path.join(target, file));
  }
  console.log(`sqlite-wasm ${version} → public/sqlite-wasm/${version}`);
}
