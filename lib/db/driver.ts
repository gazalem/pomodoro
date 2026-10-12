export type SqlParam = string | number | null;

export interface Statement {
  sql: string;
  params?: SqlParam[];
}

/**
 * The minimal async SQL surface the repository needs. Implemented by the
 * browser worker client (SQLite WASM) and by node:sqlite in tests, so the
 * same queries run in both places.
 */
export interface SqlDriver {
  /** Returns every result row as a plain object. */
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number; lastInsertRowid: number }>;
  /** Runs the statements in one transaction; all or nothing. */
  batch(statements: Statement[]): Promise<void>;
}

export async function first<T>(db: SqlDriver, sql: string, params?: SqlParam[]): Promise<T | undefined> {
  const rows = await db.all<T>(sql, params);
  return rows[0];
}
