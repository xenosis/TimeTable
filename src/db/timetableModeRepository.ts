import { timetableModes, type TimetableDatabase, type TimetableMode } from './types';

function requireMode(mode: TimetableMode): void {
  if (!timetableModes.includes(mode)) throw new Error('unknown timetable mode');
}

export async function getActiveTimetableMode(database: Pick<TimetableDatabase, 'getFirstAsync'>, familyId = 'local-family'): Promise<TimetableMode> {
  const row = await database.getFirstAsync<{ activeMode: TimetableMode }>('SELECT active_mode AS activeMode FROM timetable_settings WHERE family_id = ?', familyId);
  return row?.activeMode === 'vacation' ? 'vacation' : 'regular';
}

export async function setActiveTimetableMode(database: Pick<TimetableDatabase, 'runAsync'>, mode: TimetableMode, familyId = 'local-family'): Promise<void> {
  requireMode(mode);
  await database.runAsync(
    'INSERT INTO timetable_settings (family_id, active_mode) VALUES (?, ?) ON CONFLICT(family_id) DO UPDATE SET active_mode = excluded.active_mode',
    familyId, mode,
  );
}
