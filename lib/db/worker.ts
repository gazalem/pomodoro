/// <reference lib="webworker" />
/**
 * Dedicated worker that owns the SQLite WASM database.
 *
 * Storage: the "opfs-sahpool" VFS keeps the database file in the Origin
 * Private File System. Unlike the plain "opfs" VFS it needs no COOP/COEP
 * headers, so it works on static hosts such as GitHub Pages. Where OPFS isn't
 * available (e.g. Firefox private windows) the database runs in memory and a
 * snapshot is saved to IndexedDB after every write.
 */
import type { Database, SAHPoolUtil, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import type { SqlParam, Statement } from "./driver";
import type { OpenInfo, StorageKind, WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const DB_FILE = "/pomodoro.sqlite3";
const SQLITE_HEADER = "SQLite format 3\0";

let sqlite3: Sqlite3Static;
let db: Database;
let pool: SAHPoolUtil | null = null;
let storage: StorageKind;

// ---------------------------------------------------------------------------
// IndexedDB snapshot fallback

const IDB_NAME = "pomodoro";
const IDB_STORE = "snapshots";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const conn = await idb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(conn.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    conn.close();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Debounced snapshot of the in-memory database (fallback mode only). */
function scheduleSnapshot() {
  if (storage !== "indexeddb") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const bytes = sqlite3.capi.sqlite3_js_db_export(db);
    void idbRequest("readwrite", (s) => s.put(bytes, "db"));
  }, 250);
}

// ---------------------------------------------------------------------------
// Opening

function loadBytes(target: Database, bytes: Uint8Array) {
  const { capi, wasm } = sqlite3;
  const ptr = wasm.allocFromTypedArray(bytes);
  const rc = capi.sqlite3_deserialize(
    target.pointer!,
    "main",
    ptr,
    bytes.byteLength,
    bytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  if (rc !== 0) throw new Error(`Could not load database (sqlite error ${rc})`);
}

async function opfsAvailable(): Promise<boolean> {
  if (typeof FileSystemSyncAccessHandle === "undefined" || !navigator.storage?.getDirectory) return false;
  try {
    await navigator.storage.getDirectory(); // throws in some private-browsing modes
    return true;
  } catch {
    return false;
  }
}

async function installPool(): Promise<SAHPoolUtil> {
  // A tab that was just closed may still be releasing its file handles.
  for (let attempt = 0; ; attempt++) {
    try {
      return await sqlite3.installOpfsSAHPoolVfs({ name: "pomodoro-pool" });
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
}

/**
 * Loads the SQLite WASM module from /public (copied there by
 * scripts/copy-sqlite-wasm.mjs) rather than bundling it.
 */
async function loadSqlite(moduleUrl: string): Promise<Sqlite3Static> {
  const mod = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ moduleUrl)) as {
    default: () => Promise<Sqlite3Static>;
  };
  return mod.default();
}

async function open(moduleUrl: string): Promise<OpenInfo> {
  sqlite3 ??= await loadSqlite(moduleUrl);

  if (await opfsAvailable()) {
    pool = await installPool();
    db = new pool.OpfsSAHPoolDb(DB_FILE);
    storage = "opfs";
  } else {
    db = new sqlite3.oo1.DB(":memory:", "c");
    const snapshot = await idbRequest<Uint8Array | undefined>("readonly", (s) => s.get("db"));
    if (snapshot) loadBytes(db, snapshot);
    storage = "indexeddb";
  }
  db.exec("PRAGMA foreign_keys = ON");
  return { storage, sqliteVersion: sqlite3.version.libVersion };
}

// ---------------------------------------------------------------------------
// Queries

function all(sql: string, params: SqlParam[] = []) {
  return db.selectObjects(sql, params);
}

function run(sql: string, params: SqlParam[] = []) {
  db.exec({ sql, bind: params });
  const result = {
    changes: db.changes(),
    lastInsertRowid: Number(sqlite3.capi.sqlite3_last_insert_rowid(db.pointer!)),
  };
  scheduleSnapshot();
  return result;
}

function batch(statements: Statement[]) {
  db.transaction(() => {
    for (const { sql, params } of statements) db.exec({ sql, bind: params ?? [] });
  });
  scheduleSnapshot();
}

function exportDb(): Uint8Array {
  return pool ? pool.exportFile(DB_FILE) : sqlite3.capi.sqlite3_js_db_export(db);
}

/** Replaces the database with a backup, after checking it is one of ours. */
async function importDb(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.subarray(0, 16));
  if (header !== SQLITE_HEADER) throw new Error("That file isn't a SQLite database.");

  const probe = new sqlite3.oo1.DB(":memory:", "c");
  try {
    loadBytes(probe, bytes.slice());
    const tables = probe.selectValues(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('settings', 'tasks', 'sessions')",
    );
    if (tables.length !== 3) throw new Error("That database isn't a Pomodoro backup.");
  } finally {
    probe.close();
  }

  db.close();
  if (pool) {
    await pool.importDb(DB_FILE, bytes);
    db = new pool.OpfsSAHPoolDb(DB_FILE);
  } else {
    db = new sqlite3.oo1.DB(":memory:", "c");
    loadBytes(db, bytes);
    scheduleSnapshot();
  }
  db.exec("PRAGMA foreign_keys = ON");
}

// ---------------------------------------------------------------------------
// Message loop: requests are handled strictly in order.

async function handle(req: WorkerRequest): Promise<unknown> {
  switch (req.op) {
    case "open":
      return open(req.moduleUrl);
    case "all":
      return all(req.sql, req.params);
    case "run":
      return run(req.sql, req.params);
    case "batch":
      return batch(req.statements);
    case "export":
      return exportDb();
    case "import":
      return importDb(req.bytes);
  }
}

let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  queue = queue.then(async () => {
    let response: WorkerResponse;
    try {
      response = { id: req.id, ok: true, result: await handle(req) };
    } catch (error) {
      response = { id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const transfer = response.ok && response.result instanceof Uint8Array ? [response.result.buffer] : [];
    self.postMessage(response, transfer as Transferable[]);
  });
};
