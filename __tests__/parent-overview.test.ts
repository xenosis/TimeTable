import { childSyncLine, stickerLine, taskProgressLine } from '../src/components/parentOverview';
import { fetchChildDeviceStatus } from '../src/server/childDeviceStatus';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn() }));

type Result = { data: unknown; error: unknown };
const mockResults: Result[] = [];
const mockCalls: string[] = [];
jest.mock('../src/server/supabaseClient', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      mockCalls.push(table);
      const result = mockResults.shift() ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'in', 'not', 'order']) chain[name] = (...args: unknown[]) => { mockCalls.push(`${name}:${JSON.stringify(args)}`); return chain; };
      chain.limit = () => Promise.resolve(result);
      // 구성원 조회는 eq 두 번 뒤 바로 기다린다
      chain.then = (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  }),
}));

beforeEach(() => { mockResults.length = 0; mockCalls.length = 0; });

const stickers = (gems: number, largeGems: number, goal: { title: string; stickerGoal: number } | null) => ({
  gems, largeGems, total: gems + largeGems, goal: goal && { id: 1, ...goal }, remaining: goal ? Math.max(0, goal.stickerGoal - gems - largeGems) : null,
});

test('오늘 할 일 진행은 못 한 일을 "아직 남았어요"로 알린다', () => {
  expect(taskProgressLine([])).toBe('오늘은 할 일이 없어요.');
  expect(taskProgressLine([{ id: 1, title: '수학', completed: 1 }, { id: 2, title: '독서', completed: 0 }])).toBe('오늘 할 일 2개 중 1개 했어요. 1개가 아직 남았어요.');
  expect(taskProgressLine([{ id: 1, title: '수학', completed: 1 }])).toBe('오늘 할 일 1개를 모두 했어요.');
});

test('보석은 작은·큰 보석을 따로 보이고 보상 목표까지 남은 개수를 붙인다', () => {
  expect(stickerLine(stickers(3, 1, null))).toBe('작은 보석 3개 · 큰 보석 1개');
  expect(stickerLine(stickers(3, 1, { title: '영화', stickerGoal: 10 }))).toBe("작은 보석 3개 · 큰 보석 1개 · '영화'까지 6개 남음");
  expect(stickerLine(stickers(9, 1, { title: '영화', stickerGoal: 10 }))).toBe("작은 보석 9개 · 큰 보석 1개 · '영화' 목표를 채웠어요");
});

test('딸 계정 기기 중 가장 최근에 맞춘 기록을 가져온다', async () => {
  mockResults.push({ data: [{ user_id: 'child-1' }], error: null }, { data: [{ last_synced_at: '2026-10-07T05:00:00Z', app_version: '1.53.1' }], error: null });
  await expect(fetchChildDeviceStatus('fam-1')).resolves.toEqual({ lastSyncedAt: '2026-10-07T05:00:00Z', appVersion: '1.53.1' });
  expect(mockCalls).toContain('eq:["role","child"]');
  expect(mockCalls).toContain('in:["user_id",["child-1"]]');
  expect(mockCalls).toContain('order:["last_synced_at",{"ascending":false}]');
});

test('딸 계정이 없거나 기록이 없으면 null, 조회 실패는 알기 쉬운 오류로 바꾼다', async () => {
  mockResults.push({ data: [], error: null });
  await expect(fetchChildDeviceStatus('fam-1')).resolves.toBeNull();
  mockResults.push({ data: [{ user_id: 'child-1' }], error: null }, { data: [], error: null });
  await expect(fetchChildDeviceStatus('fam-1')).resolves.toBeNull();
  mockResults.push({ data: null, error: { message: 'fetch failed' } });
  await expect(fetchChildDeviceStatus('fam-1')).rejects.toThrow('딸 폰 기록을 불러오지 못했어요');
});

test('딸 폰 마지막 동기화 시각을 앱 버전과 함께 보이고, 기록이 없거나 실패하면 그대로 알린다', () => {
  const now = new Date(2026, 9, 7, 15, 0);
  expect(childSyncLine({ state: 'ready', device: { lastSyncedAt: new Date(2026, 9, 7, 14, 5).toISOString(), appVersion: '1.54.0' } }, null, now)).toBe('딸 폰이 마지막으로 맞춘 때: 오늘 14:05 (앱 1.54.0)');
  expect(childSyncLine({ state: 'ready', device: null }, null, now)).toBe('딸 폰이 아직 서버와 맞춘 적이 없어요.');
  expect(childSyncLine({ state: 'error', message: '딸 폰 기록을 불러오지 못했어요.' }, null, now)).toBe('딸 폰 기록을 불러오지 못했어요.');
  expect(childSyncLine({ state: 'loading' }, null, now)).toBe('딸 폰 기록을 불러오는 중이에요.');
});

test('이 폰에서 마지막으로 고친 뒤 딸 폰이 맞췄으면 반영 완료, 아니면 아직 반영 전이라고 알린다', () => {
  const now = new Date(2026, 9, 7, 15, 0);
  const device = { lastSyncedAt: new Date(2026, 9, 7, 14, 5).toISOString(), appVersion: null };
  expect(childSyncLine({ state: 'ready', device }, new Date(2026, 9, 7, 14, 0).toISOString(), now)).toBe('딸 폰 반영 완료 (오늘 14:05)');
  expect(childSyncLine({ state: 'ready', device }, new Date(2026, 9, 7, 14, 30).toISOString(), now))
    .toBe('딸 폰이 마지막으로 맞춘 때: 오늘 14:05\n오늘 14:30에 고친 내용은 아직 딸 폰에 반영 전이에요. 딸 폰에서 앱을 열면 반영돼요.');
});
