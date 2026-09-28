import * as SQLite from 'expo-sqlite';

import { migrateDatabase } from './migrations';
import type { TimetableDatabase } from './types';

let databasePromise: Promise<TimetableDatabase> | null = null;

export function getDatabase(): Promise<TimetableDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('timetable.db')
      .then(async (database) => {
        await database.execAsync('PRAGMA foreign_keys = ON');
        await migrateDatabase(database);
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
  }
  return databasePromise;
}
