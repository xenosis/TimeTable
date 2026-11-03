/** V14: after_school 허용. 기존 항목의 종류·ID·메모·알림·세트와 인덱스를 그대로 보존한다. */
export const schemaV14 = [
  `CREATE TABLE timetable_items_v14 (
    id INTEGER PRIMARY KEY,
    family_id TEXT NOT NULL DEFAULT 'local-family' CHECK (length(trim(family_id)) > 0),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    period_no INTEGER,
    start_time TEXT,
    end_time TEXT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    category TEXT NOT NULL CHECK (category IN ('school', 'after_school', 'academy', 'care', 'life')),
    color_key TEXT NOT NULL CHECK (color_key IN ('korean', 'math', 'english', 'science', 'music', 'art', 'physical-education', 'academy', 'life', 'other')),
    icon_key TEXT NOT NULL CHECK (icon_key IN ('text', 'number', 'alphabet', 'experiment', 'music-note', 'art-tool', 'activity', 'academy', 'life', 'other')),
    alert_mode TEXT NOT NULL DEFAULT 'none' CHECK (alert_mode IN ('none', 'notify', 'alarm')),
    alert_before_min INTEGER NOT NULL DEFAULT 0 CHECK (alert_before_min >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    timetable_mode TEXT NOT NULL DEFAULT 'regular' CHECK (timetable_mode IN ('regular', 'vacation')),
    set_id INTEGER REFERENCES timetable_sets(id) ON DELETE CASCADE,
    memo TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (family_id, period_no) REFERENCES periods(family_id, period_no),
    CHECK ((period_no IS NOT NULL AND start_time IS NULL AND end_time IS NULL)
      OR (period_no IS NULL AND start_time IS NOT NULL AND end_time IS NOT NULL))
  )`,
  `INSERT INTO timetable_items_v14 (id, family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, created_at, timetable_mode, set_id, memo)
   SELECT id, family_id, weekday, period_no, start_time, end_time, title, category, color_key, icon_key, alert_mode, alert_before_min, created_at, timetable_mode, set_id, memo FROM timetable_items`,
  'DROP TABLE timetable_items',
  'ALTER TABLE timetable_items_v14 RENAME TO timetable_items',
  'CREATE INDEX timetable_items_weekday_period ON timetable_items(family_id, weekday, period_no)',
  'CREATE INDEX timetable_items_weekday_time ON timetable_items(family_id, weekday, start_time)',
  'CREATE INDEX timetable_items_mode_weekday ON timetable_items(family_id, timetable_mode, weekday)',
  'CREATE INDEX timetable_items_set_weekday ON timetable_items(family_id, set_id, weekday)',
] as const;
