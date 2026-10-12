import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SqlDriver } from "../lib/db/driver.ts";

/** In-memory node:sqlite implementation of the browser driver interface. */
export function nodeDriver(): SqlDriver {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const bind = (params: SQLInputValue[] = []) => params;

  return {
    async all<T>(sql: string, params?: SQLInputValue[]) {
      return db.prepare(sql).all(...bind(params)) as T[];
    },
    async run(sql: string, params?: SQLInputValue[]) {
      const r = db.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        for (const s of statements) db.prepare(s.sql).run(...bind(s.params));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
