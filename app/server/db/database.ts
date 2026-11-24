import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MIGRATIONS } from "./schema.ts";

const globalForDatabase = globalThis as typeof globalThis & {
  m4iDatabase?: DatabaseSync;
};

export function dataDirectory(): string {
  // The data directory is a runtime volume, not part of the build output.
  return resolve(
    /*turbopackIgnore: true*/ process.env.DATA_DIR?.trim() || "data",
  );
}

function migrate(db: DatabaseSync): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };

  // Rebuilding a table means dropping it, which would cascade-delete every
  // row that references it while foreign keys are enforced.
  db.exec("PRAGMA foreign_keys = OFF");
  for (let index = version; index < MIGRATIONS.length; index += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[index]);
      requireValidForeignKeys(db);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    });
  }
  db.exec("PRAGMA foreign_keys = ON");
}

function requireValidForeignKeys(db: DatabaseSync): void {
  const violations = db.prepare("PRAGMA foreign_key_check").all();
  if (violations.length > 0) {
    throw new Error(
      `A migration left ${violations.length} rows with broken foreign keys.`,
    );
  }
}

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");

  if (path !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }

  migrate(db);
  return db;
}

export function getDatabase(): DatabaseSync {
  if (!globalForDatabase.m4iDatabase) {
    mkdirSync(dataDirectory(), { recursive: true });
    globalForDatabase.m4iDatabase = openDatabase(
      join(dataDirectory(), "m4i.sqlite"),
    );
  }

  return globalForDatabase.m4iDatabase;
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");

  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function now(): string {
  return new Date().toISOString();
}
