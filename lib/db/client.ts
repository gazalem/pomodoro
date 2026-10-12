import sqliteWasmPackage from "@sqlite.org/sqlite-wasm/package.json";
import { BASE_PATH } from "../base-path";
import type { SqlDriver, SqlParam, Statement } from "./driver";
import type { OpenInfo, WorkerRequest, WorkerResponse } from "./protocol";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

// Distributive Omit so each request variant keeps its own fields.
type Payload = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

export interface WorkerDriver extends SqlDriver {
  open(): Promise<OpenInfo>;
  exportDb(): Promise<Uint8Array>;
  importDb(bytes: Uint8Array): Promise<void>;
}

/** Promise-based RPC to the SQLite worker. */
export function createWorkerDriver(): WorkerDriver {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "pomodoro-db" });
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const entry = pending.get(res.id);
    if (!entry) return;
    pending.delete(res.id);
    if (res.ok) entry.resolve(res.result);
    else entry.reject(new Error(res.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "The database worker crashed.");
    pending.forEach((p) => p.reject(error));
    pending.clear();
  };

  function call<T>(payload: Payload, transfer: Transferable[] = []): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage({ ...payload, id }, transfer);
    });
  }

  return {
    open: () =>
      call<OpenInfo>({
        op: "open",
        moduleUrl: new URL(`${BASE_PATH}/sqlite-wasm/${sqliteWasmPackage.version}/index.mjs`, location.href).href,
      }),
    all: <T>(sql: string, params?: SqlParam[]) => call<T[]>({ op: "all", sql, params }),
    run: (sql: string, params?: SqlParam[]) =>
      call<{ changes: number; lastInsertRowid: number }>({ op: "run", sql, params }),
    batch: (statements: Statement[]) => call<void>({ op: "batch", statements }),
    exportDb: () => call<Uint8Array>({ op: "export" }),
    importDb: (bytes: Uint8Array) => call<void>({ op: "import", bytes }, [bytes.buffer]),
  };
}
