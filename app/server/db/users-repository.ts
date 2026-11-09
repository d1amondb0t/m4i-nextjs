import type { DatabaseSync } from "node:sqlite";

import type { User } from "@/types/feedback-types";
import {
  collectionForUser,
  generateAccessCode,
  hashAccessCode,
} from "../auth/access-code-helper.ts";
import { now } from "./database.ts";

type UserRow = {
  id: number;
  name: string;
  collection: string;
  is_admin: number;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    collection: row.collection,
    isAdmin: row.is_admin === 1,
  };
}

export function createUser(
  db: DatabaseSync,
  name: string,
  isAdmin = false,
): { user: User; accessCode: string } {
  const trimmed = name.trim();
  const accessCode = generateAccessCode();
  const collection = collectionForUser(trimmed);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (name, access_code_hash, collection, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      trimmed,
      hashAccessCode(accessCode),
      collection,
      isAdmin ? 1 : 0,
      now(),
    );

  return { user: findUserById(db, Number(lastInsertRowid))!, accessCode };
}

export function resetAccessCode(db: DatabaseSync, name: string): string {
  const accessCode = generateAccessCode();
  const { changes } = db
    .prepare("UPDATE users SET access_code_hash = ? WHERE name = ?")
    .run(hashAccessCode(accessCode), name.trim());

  if (changes === 0) {
    throw new Error(`No user is named "${name}".`);
  }

  return accessCode;
}

export function findUserById(db: DatabaseSync, id: number): User | null {
  const row = db
    .prepare("SELECT id, name, collection, is_admin FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;

  return row ? toUser(row) : null;
}

export function findUserByAccessCode(
  db: DatabaseSync,
  accessCode: string,
): User | null {
  const row = db
    .prepare(
      "SELECT id, name, collection, is_admin FROM users WHERE access_code_hash = ?",
    )
    .get(hashAccessCode(accessCode)) as UserRow | undefined;

  return row ? toUser(row) : null;
}

export function listUsers(db: DatabaseSync): User[] {
  return (
    db
      .prepare("SELECT id, name, collection, is_admin FROM users ORDER BY id")
      .all() as UserRow[]
  ).map(toUser);
}
