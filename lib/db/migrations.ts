import { first, type SqlDriver } from "./driver";

/**
 * Ordered schema migrations. The index + 1 is stored in PRAGMA user_version,
 * so only append to this list; never edit an entry that has shipped.
 */
const MIGRATIONS = [
  [
    `CREATE TABLE settings (
       id         INTEGER PRIMARY KEY CHECK (id = 1),
       data       TEXT    NOT NULL,
       updated_at INTEGER NOT NULL
     )`,
    `CREATE TABLE tasks (
       id                  INTEGER PRIMARY KEY AUTOINCREMENT,
       title               TEXT    NOT NULL,
       estimated_pomodoros INTEGER NOT NULL DEFAULT 1,
       done                INTEGER NOT NULL DEFAULT 0,
       created_at          INTEGER NOT NULL,
       completed_at        INTEGER,
       completed_date      TEXT
     )`,
    `CREATE TABLE sessions (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       client_id       TEXT    NOT NULL UNIQUE,
       type            TEXT    NOT NULL CHECK (type IN ('focus', 'short_break', 'long_break', 'lunch')),
       status          TEXT    NOT NULL CHECK (status IN ('completed', 'skipped', 'stopped')),
       task_id         INTEGER REFERENCES tasks (id) ON DELETE SET NULL,
       planned_seconds INTEGER NOT NULL,
       actual_seconds  INTEGER NOT NULL,
       started_at      INTEGER NOT NULL,
       ended_at        INTEGER NOT NULL,
       local_date      TEXT    NOT NULL,
       local_hour      INTEGER NOT NULL
     )`,
    "CREATE INDEX sessions_local_date ON sessions (local_date)",
    "CREATE INDEX sessions_task_id ON sessions (task_id)",
    "CREATE INDEX tasks_done ON tasks (done, completed_at)",
  ],
];

export async function migrate(db: SqlDriver): Promise<void> {
  const row = await first<{ user_version: number }>(db, "PRAGMA user_version");
  const version = row?.user_version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.batch([
      ...MIGRATIONS[i].map((sql) => ({ sql })),
      { sql: `PRAGMA user_version = ${i + 1}` },
    ]);
  }
}
