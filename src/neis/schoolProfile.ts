import Storage from 'expo-sqlite/kv-store';

/** 학교 시간표 가져오기에 쓰는 학교·학년·반 설정(P8.1). 이 폰에만 저장한다. */
export type SchoolProfile = { readonly officeCode: string; readonly schoolCode: string; readonly schoolName: string; readonly grade: number; readonly classNo: string };

const KEY = 'timetable.school-profile';

export function parseSchoolProfile(raw: string | null): SchoolProfile | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<SchoolProfile> | null;
    if (!value || typeof value.officeCode !== 'string' || typeof value.schoolCode !== 'string' || typeof value.schoolName !== 'string') return null;
    if (!Number.isInteger(value.grade) || (value.grade ?? 0) < 1 || (value.grade ?? 0) > 6 || typeof value.classNo !== 'string' || !value.classNo.trim()) return null;
    return { officeCode: value.officeCode, schoolCode: value.schoolCode, schoolName: value.schoolName, grade: value.grade!, classNo: value.classNo.trim() };
  } catch {
    return null;
  }
}

export async function loadSchoolProfile(): Promise<SchoolProfile | null> {
  return parseSchoolProfile(await Storage.getItemAsync(KEY));
}

export async function saveSchoolProfile(profile: SchoolProfile): Promise<void> {
  if (parseSchoolProfile(JSON.stringify(profile)) === null) throw new Error('학교·학년(1~6)·반을 다시 확인해 주세요.');
  await Storage.setItemAsync(KEY, JSON.stringify(profile));
}
