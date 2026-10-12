import type { SqlParam, Statement } from "./driver";

/** Where the database file lives in this browser. */
export type StorageKind = "opfs" | "indexeddb";

export interface OpenInfo {
  storage: StorageKind;
  sqliteVersion: string;
}

export type WorkerRequest =
  | { id: number; op: "open"; moduleUrl: string }
  | { id: number; op: "all"; sql: string; params?: SqlParam[] }
  | { id: number; op: "run"; sql: string; params?: SqlParam[] }
  | { id: number; op: "batch"; statements: Statement[] }
  | { id: number; op: "export" }
  | { id: number; op: "import"; bytes: Uint8Array };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };
