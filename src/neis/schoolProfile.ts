import Storage from 'expo-sqlite/kv-store';

import { getDatabase } from '../db/database';
import { getActiveTimetableSet } from '../db/timetableSetRepository';
import type { TimetableDatabase } from '../db/types';
import { runAdminEdit } from '../sync/adminEditGate';

/**
 * 학교 시간표 가져오기·자동 갱신에 쓰는 학교·학년·반 설정(P8.1·P8.7).
 * 가족 설정(timetable_settings)에 저장해 로그인한 폰이면 서버를 거쳐 아빠 폰과 딸 폰이 함께 쓴다.
 * 1.59 이하에서는 이 폰에만(kv-store) 저장했으므로, 그 값은 읽을 수 있게 두고 다음 저장 때 가족 설정으로 옮긴다.
 */
export type SchoolProfile = { readonly officeCode: string; readonly schoolCode: string; readonly schoolName: string; readonly grade: number; readonly classNo: string };

const DEVICE_KEY = 'timetable.school-profile';
type ProfileDatabase = Pick<TimetableDatabase, 'getFirstAsync' | 'runAsync'>;

function validProfile(value: Partial<SchoolProfile> | null): SchoolProfile | null {
  if (!value || typeof value.officeCode !== 'string' || typeof value.schoolCode !== 'string' || typeof value.schoolName !== 'string') return null;
  if (!value.officeCode.trim() || !value.schoolCode.trim() || !value.schoolName.trim()) return null;
  if (!Number.isInteger(value.grade) || (value.grade ?? 0) < 1 || (value.grade ?? 0) > 6 || typeof value.classNo !== 'string' || !value.classNo.trim()) return null;
  return { officeCode: value.officeCode, schoolCode: value.schoolCode, schoolName: value.schoolName, grade: value.grade!, classNo: value.classNo.trim() };
}

export function parseSchoolProfile(raw: string | null): SchoolProfile | null {
  try {
    return validProfile(JSON.parse(raw ?? 'null') as Partial<SchoolProfile> | null);
  } catch {
    return null;
  }
}

/** 가족 설정에 저장된 학교 설정. 없으면 null. */
export async function readSharedSchoolProfile(database: ProfileDatabase): Promise<SchoolProfile | null> {
  const row = await database.getFirstAsync<{ officeCode: string | null; schoolCode: string | null; schoolName: string | null; grade: number | null; classNo: string | null }>(
    `SELECT school_office_code AS officeCode, school_code AS schoolCode, school_name AS schoolName, school_grade AS grade, school_class AS classNo
     FROM timetable_settings WHERE family_id = 'local-family'`,
  );
  return row ? validProfile({ officeCode: row.officeCode ?? undefined, schoolCode: row.schoolCode ?? undefined, schoolName: row.schoolName ?? undefined, grade: row.grade ?? undefined, classNo: row.classNo ?? undefined }) : null;
}

/** 가족 설정에 쓴다. 적용 세트 행이 없으면 먼저 만든다(학교 칸만 바꾸고 적용 세트는 그대로). */
export async function writeSharedSchoolProfile(database: Pick<TimetableDatabase, 'execAsync' | 'getAllAsync' | 'getFirstAsync' | 'runAsync'>, profile: SchoolProfile): Promise<void> {
  await getActiveTimetableSet(database);
  await database.runAsync(
    "UPDATE timetable_settings SET school_office_code = ?, school_code = ?, school_name = ?, school_grade = ?, school_class = ? WHERE family_id = 'local-family'",
    profile.officeCode, profile.schoolCode, profile.schoolName, profile.grade, profile.classNo,
  );
}

/** 가족 설정의 학교 설정, 없으면 이 폰에만 남아 있는 옛 설정. */
export async function loadSchoolProfile(): Promise<SchoolProfile | null> {
  return await readSharedSchoolProfile(await getDatabase()) ?? parseSchoolProfile(await Storage.getItemAsync(DEVICE_KEY));
}

/** 가족 설정에 저장한다. 로그인한 폰이면 서버에 먼저 저장하고, 실패하면 되돌린 채 오류를 던진다. */
export async function saveSchoolProfile(profile: SchoolProfile): Promise<void> {
  const valid = validProfile(profile);
  if (!valid) throw new Error('학교·학년(1~6)·반을 다시 확인해 주세요.');
  await runAdminEdit(async () => writeSharedSchoolProfile(await getDatabase(), valid));
  await Storage.removeItemAsync(DEVICE_KEY).catch(() => undefined);
}

/** 이 폰에만 있는 옛 설정을 가족 설정으로 옮긴다(가족 설정이 이미 있으면 그것을 따르고 옛 설정은 지운다). */
export async function shareDeviceSchoolProfile(): Promise<void> {
  const device = parseSchoolProfile(await Storage.getItemAsync(DEVICE_KEY));
  if (!device) return;
  if (await readSharedSchoolProfile(await getDatabase())) {
    await Storage.removeItemAsync(DEVICE_KEY).catch(() => undefined);
    return;
  }
  await saveSchoolProfile(device);
}
