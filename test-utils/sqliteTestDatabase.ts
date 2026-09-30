import type { TimetableDatabase } from '../src/db/types';

/* eslint-disable @typescript-eslint/no-require-imports */
// @types/node를 추가하지 않고(라이브러리 정책) Node 내장 모듈을 require로 불러온다
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => NodeDb };
const { mkdtempSync, rmSync } = require('node:fs') as { mkdtempSync(prefix: string): string; rmSync(path: string, options: { recursive: boolean; force: boolean }): void };
const { tmpdir } = require('node:os') as { tmpdir(): string };
const { join } = require('node:path') as { join(...parts: string[]): string };
/* eslint-enable @typescript-eslint/no-require-imports */

type NodeDb = { close(): void; exec(sql: string): void; prepare(sql: string): { get(...p: unknown[]): unknown; all(...p: unknown[]): unknown[]; run(...p: unknown[]): unknown } };

export type TestDatabase = TimetableDatabase & { close(): void };

/** 실제 SQLite 엔진(Node 내장)을 앱의 TimetableDatabase 모양으로 감싼다. 목이 아니라 진짜 SQL을 검증하기 위함이다. */
export function openTestDatabase(path = ':memory:'): TestDatabase {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  return {
    close: () => db.close(),
    execAsync: async (sql) => { db.exec(sql); },
    getFirstAsync: async <T,>(sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) ?? null) as T | null,
    getAllAsync: async <T,>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as T[],
    runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
  };
}

/** 임시 폴더를 만들어 콜백에 넘기고, 끝나면 지운다(파일 DB로 재시작을 시험할 때 쓴다). */
export function withTempDirectory<T>(prefix: string, run: (directory: string, pathOf: (name: string) => string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  return run(directory, (name) => join(directory, name)).finally(() => rmSync(directory, { recursive: true, force: true }));
}
