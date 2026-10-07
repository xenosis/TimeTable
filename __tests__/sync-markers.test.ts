import { lastAdminEditAt, markAdminEdit } from '../src/sync/syncMarkers';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) },
  });
});

test('관리자 저장 시각은 다른 가족이나 이전 전역 값에서 가져오지 않는다', () => {
  memory.set('tt.sync.lastEdit', '2026-10-01T01:00:00Z');
  expect(lastAdminEditAt('family-b')).toBeNull();
  markAdminEdit('family-a', '2026-10-08T01:00:00Z');
  expect(lastAdminEditAt('family-a')).toBe('2026-10-08T01:00:00Z');
  expect(lastAdminEditAt('family-b')).toBeNull();
  markAdminEdit('family-b', '2026-10-08T02:00:00Z');
  expect(lastAdminEditAt('family-a')).toBe('2026-10-08T01:00:00Z');
  expect(lastAdminEditAt('family-b')).toBe('2026-10-08T02:00:00Z');
});
