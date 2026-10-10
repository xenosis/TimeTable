/** @jest-environment node */
import { migrateDatabase } from '../src/db/migrations';
import type { TimetableDatabase } from '../src/db/types';
import { loadSchoolProfile, readSharedSchoolProfile, saveSchoolProfile, shareDeviceSchoolProfile } from '../src/neis/schoolProfile';
import { openTestDatabase } from '../test-utils/sqliteTestDatabase';

const mockStore = new Map<string, string>();
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: {
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockStore.set(key, value); },
  removeItemAsync: async (key: string) => { mockStore.delete(key); },
} }));
let mockDatabase: TimetableDatabase;
jest.mock('../src/db/database', () => ({ getDatabase: async () => mockDatabase }));
const mockRunAdminEdit = jest.fn((action: () => Promise<unknown>) => action());
jest.mock('../src/sync/adminEditGate', () => ({ runAdminEdit: (action: () => Promise<unknown>) => mockRunAdminEdit(action) }));

const school = { officeCode: 'J10', schoolCode: '7591095', schoolName: '빛가온초등학교', grade: 2, classNo: '6' };
const KEY = 'timetable.school-profile';

beforeEach(async () => {
  mockStore.clear();
  mockRunAdminEdit.mockClear();
  mockDatabase = openTestDatabase();
  await migrateDatabase(mockDatabase);
});

test('학교 설정은 가족 설정에 저장해 서버를 거쳐 공유하고(관리자 편집 경로), 이 폰의 옛 설정은 지운다', async () => {
  mockStore.set(KEY, JSON.stringify({ ...school, classNo: '5' }));
  await saveSchoolProfile(school);
  expect(mockRunAdminEdit).toHaveBeenCalledTimes(1);
  expect(await readSharedSchoolProfile(mockDatabase)).toEqual(school);
  expect(mockStore.has(KEY)).toBe(false);
  expect(await loadSchoolProfile()).toEqual(school);
});

test('가족 설정이 없으면 이 폰의 옛 설정을 읽고, 옮기기를 하면 가족 설정으로 옮긴다', async () => {
  mockStore.set(KEY, JSON.stringify(school));
  expect(await readSharedSchoolProfile(mockDatabase)).toBeNull();
  expect(await loadSchoolProfile()).toEqual(school);
  await shareDeviceSchoolProfile();
  expect(await readSharedSchoolProfile(mockDatabase)).toEqual(school);
  expect(mockStore.has(KEY)).toBe(false);
});

test('가족 설정이 이미 있으면(아빠 폰에서 정함) 옛 설정을 덮어쓰지 않고 지운다', async () => {
  await saveSchoolProfile(school);
  mockStore.set(KEY, JSON.stringify({ ...school, classNo: '3' }));
  mockRunAdminEdit.mockClear();
  await shareDeviceSchoolProfile();
  expect(mockRunAdminEdit).not.toHaveBeenCalled();
  expect((await readSharedSchoolProfile(mockDatabase))?.classNo).toBe('6');
  expect(mockStore.has(KEY)).toBe(false);
});

test('학년이 1~6이 아니거나 반이 비면 저장하지 않는다', async () => {
  await expect(saveSchoolProfile({ ...school, grade: 7 })).rejects.toThrow('학교·학년(1~6)·반');
  await expect(saveSchoolProfile({ ...school, classNo: ' ' })).rejects.toThrow('학교·학년(1~6)·반');
  expect(await readSharedSchoolProfile(mockDatabase)).toBeNull();
});

test('서버 저장이 실패하면 오류를 그대로 알리고 옛 설정은 남긴다', async () => {
  mockStore.set(KEY, JSON.stringify(school));
  mockRunAdminEdit.mockImplementationOnce(async () => { throw new Error('인터넷 연결을 확인해 주세요.'); });
  await expect(shareDeviceSchoolProfile()).rejects.toThrow('인터넷');
  expect(mockStore.has(KEY)).toBe(true);
});
