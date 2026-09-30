import type { TimetableDatabase } from './types';

export const databaseVersion = 9;

export const schemaV1 = [
  `CREATE TABLE IF NOT EXISTS periods (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family' CHECK (length(trim(family_id)) > 0),
    period_no INTEGER NOT NULL CHECK (period_no > 0),
    start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (family_id, period_no)
  )`,
  `CREATE TABLE IF NOT EXISTS timetable_items (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family' CHECK (length(trim(family_id)) > 0),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    period_no INTEGER,
    start_time TEXT,
    end_time TEXT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    category TEXT NOT NULL CHECK (category IN ('school', 'academy', 'life')),
    color_key TEXT NOT NULL CHECK (color_key IN ('korean', 'math', 'english', 'science', 'music', 'art', 'physical-education', 'academy', 'life', 'other')),
    icon_key TEXT NOT NULL CHECK (icon_key IN ('text', 'number', 'alphabet', 'experiment', 'music-note', 'art-tool', 'activity', 'academy', 'life', 'other')),
    alert_mode TEXT NOT NULL DEFAULT 'none' CHECK (alert_mode IN ('none', 'notify', 'alarm')),
    alert_before_min INTEGER NOT NULL DEFAULT 0 CHECK (alert_before_min >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id, period_no) REFERENCES periods(family_id, period_no),
    CHECK ((period_no IS NOT NULL AND start_time IS NULL AND end_time IS NULL)
      OR (period_no IS NULL AND start_time IS NOT NULL AND end_time IS NOT NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS day_exceptions (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family' CHECK (length(trim(family_id)) > 0),
    start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    end_date TEXT NOT NULL CHECK (end_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    type TEXT NOT NULL CHECK (type IN ('holiday', 'vacation', 'discretionary')),
    note TEXT NOT NULL DEFAULT '',
    CHECK (end_date >= start_date)
  )`,
  'CREATE INDEX IF NOT EXISTS timetable_items_weekday_period ON timetable_items(family_id, weekday, period_no)',
  'CREATE INDEX IF NOT EXISTS timetable_items_weekday_time ON timetable_items(family_id, weekday, start_time)',
  'CREATE INDEX IF NOT EXISTS day_exceptions_dates ON day_exceptions(family_id, start_date, end_date)',
] as const;

export const schemaV2 = [
  "ALTER TABLE timetable_items ADD COLUMN timetable_mode TEXT NOT NULL DEFAULT 'regular' CHECK (timetable_mode IN ('regular', 'vacation'))",
  "CREATE TABLE IF NOT EXISTS timetable_settings (family_id TEXT PRIMARY KEY, active_mode TEXT NOT NULL DEFAULT 'regular' CHECK (active_mode IN ('regular', 'vacation')))",
  "CREATE INDEX IF NOT EXISTS timetable_items_mode_weekday ON timetable_items(family_id, timetable_mode, weekday)",
] as const;

export const schemaV3 = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family',
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    repeat_weekdays TEXT,
    task_date TEXT,
    remind_time TEXT,
    alert_mode TEXT NOT NULL DEFAULT 'none' CHECK (alert_mode IN ('none', 'notify', 'alarm')),
    sticker_reward INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (repeat_weekdays IS NOT NULL OR task_date IS NOT NULL)
  )`,
  `CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completion_date TEXT NOT NULL,
    done_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    done_by TEXT NOT NULL DEFAULT 'child',
    UNIQUE (task_id, completion_date)
  )`,
  `CREATE TABLE IF NOT EXISTS sticker_ledger (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family',
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family',
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    sticker_goal INTEGER NOT NULL CHECK (sticker_goal > 0),
    achieved_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS tasks_family_date ON tasks(family_id, task_date)',
  'CREATE INDEX IF NOT EXISTS task_completions_date ON task_completions(completion_date)',
  'CREATE INDEX IF NOT EXISTS sticker_ledger_family ON sticker_ledger(family_id, created_at)',
] as const;

export const schemaV4 = [
  "ALTER TABLE sticker_ledger ADD COLUMN child_id TEXT NOT NULL DEFAULT 'local-child'",
] as const;

export const schemaV5 = [
  "DELETE FROM sticker_ledger WHERE (reason LIKE 'daily-completion:%' OR reason LIKE 'gem-reward:%') AND id NOT IN (SELECT MIN(id) FROM sticker_ledger WHERE reason LIKE 'daily-completion:%' OR reason LIKE 'gem-reward:%' GROUP BY family_id, reason)",
  "CREATE UNIQUE INDEX IF NOT EXISTS sticker_ledger_completion_reason ON sticker_ledger(family_id, reason) WHERE reason LIKE 'daily-completion:%' OR reason LIKE 'gem-reward:%'",
] as const;

export const schemaV6 = [
  'ALTER TABLE tasks ADD COLUMN effective_from TEXT',
  "UPDATE tasks SET effective_from = substr(created_at, 1, 10) WHERE repeat_weekdays IS NOT NULL AND effective_from IS NULL",
] as const;

export const schemaV7 = [
  `CREATE TABLE IF NOT EXISTS task_completion_history (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completion_date TEXT NOT NULL,
    PRIMARY KEY (task_id, completion_date)
  )`,
  'INSERT OR IGNORE INTO task_completion_history (task_id, completion_date) SELECT task_id, completion_date FROM task_completions',
] as const;

export const schemaV8 = [
  'ALTER TABLE tasks ADD COLUMN effective_until TEXT',
] as const;

/**
 * 시간표 세트: 평소/방학 2개 고정 모드를 임의 개수·이름의 시간표 세트로 바꾼다.
 * 기존 timetable_mode·active_mode 컬럼은 남겨 두되(옛 CHECK 제약 때문에 제거 불가) 더는 읽지 않는다.
 * 기존 평소 항목은 '평소' 세트로, 방학 항목(또는 방학 모드가 켜진 경우)은 '방학' 세트로 옮긴다.
 */
export const schemaV9 = [
  `CREATE TABLE IF NOT EXISTS timetable_sets (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family' CHECK (length(trim(family_id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (family_id, name)
  )`,
  'ALTER TABLE timetable_items ADD COLUMN set_id INTEGER REFERENCES timetable_sets(id) ON DELETE CASCADE',
  'ALTER TABLE timetable_settings ADD COLUMN active_set_id INTEGER REFERENCES timetable_sets(id) ON DELETE SET NULL',
  "INSERT INTO timetable_sets (family_id, name) SELECT family_id, '평소' FROM (SELECT family_id FROM timetable_items UNION SELECT family_id FROM timetable_settings UNION SELECT 'local-family')",
  "INSERT INTO timetable_sets (family_id, name) SELECT family_id, '방학' FROM (SELECT family_id FROM timetable_items WHERE timetable_mode = 'vacation' UNION SELECT family_id FROM timetable_settings WHERE active_mode = 'vacation')",
  "UPDATE timetable_items SET set_id = (SELECT id FROM timetable_sets WHERE timetable_sets.family_id = timetable_items.family_id AND timetable_sets.name = CASE timetable_items.timetable_mode WHEN 'vacation' THEN '방학' ELSE '평소' END)",
  "INSERT OR IGNORE INTO timetable_settings (family_id, active_mode) SELECT family_id, 'regular' FROM timetable_sets",
  "UPDATE timetable_settings SET active_set_id = (SELECT id FROM timetable_sets WHERE timetable_sets.family_id = timetable_settings.family_id AND timetable_sets.name = CASE timetable_settings.active_mode WHEN 'vacation' THEN '방학' ELSE '평소' END)",
  'CREATE INDEX IF NOT EXISTS timetable_items_set_weekday ON timetable_items(family_id, set_id, weekday)',
] as const;

type UserVersionRow = { user_version: number };

export async function migrateDatabase(database: Pick<TimetableDatabase, 'execAsync' | 'getFirstAsync'>): Promise<void> {
  const version = (await database.getFirstAsync<UserVersionRow>('PRAGMA user_version'))?.user_version ?? 0;
  if (version >= databaseVersion) return;

  await database.execAsync('BEGIN IMMEDIATE');
  try {
    if (version < 1) {
      for (const statement of schemaV1) await database.execAsync(statement);
      await database.execAsync('PRAGMA user_version = 1');
    }
    if (version < 2) {
      for (const statement of schemaV2) await database.execAsync(statement);
      await database.execAsync('PRAGMA user_version = 2');
    }
    if (version < 3) {
      for (const statement of schemaV3) await database.execAsync(statement);
      await database.execAsync(`PRAGMA user_version = ${databaseVersion}`);
    }
    if (version < 4) {
      for (const statement of schemaV4) await database.execAsync(statement);
      await database.execAsync(`PRAGMA user_version = ${databaseVersion}`);
    }
    if (version < 5) {
      for (const statement of schemaV5) await database.execAsync(statement);
      await database.execAsync(`PRAGMA user_version = ${databaseVersion}`);
    }
    if (version < 6) {
      for (const statement of schemaV6) await database.execAsync(statement);
      await database.execAsync(`PRAGMA user_version = ${databaseVersion}`);
    }
    if (version < 7) {
      for (const statement of schemaV7) await database.execAsync(statement);
      await database.execAsync(`PRAGMA user_version = ${databaseVersion}`);
    }
    if (version < 8) {
      for (const statement of schemaV8) await database.execAsync(statement);
      await database.execAsync(`PRAGMA user_version = ${databaseVersion}`);
    }
    if (version < 9) {
      for (const statement of schemaV9) await database.execAsync(statement);
      await database.execAsync(`PRAGMA user_version = ${databaseVersion}`);
    }
    await database.execAsync('COMMIT');
  } catch (error) {
    await database.execAsync('ROLLBACK');
    throw error;
  }
}
