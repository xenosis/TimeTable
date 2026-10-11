import type { AccountState } from '../src/server/account';

let mockAccount: AccountState;
let mockGeneration = 0;
const mockRestore = jest.fn();
const mockRunSync = jest.fn();
const mockSetAccount = jest.fn((state: AccountState) => { mockAccount = state; });
jest.mock('../src/server/account', () => ({ restoreAccount: mockRestore }));
jest.mock('../src/store/accountStore', () => ({
  getAccount: () => mockAccount, accountUserActions: () => mockGeneration, setAccount: mockSetAccount,
}));
jest.mock('../src/sync/syncRunner', () => ({
  runSync: mockRunSync,
  syncTarget: (state: AccountState) => state.kind === 'signedIn' && state.membership ? state.membership : null,
}));
// 모의 함수가 준비된 뒤 실행 모듈을 읽는다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncFamilyInBackground } = require('../src/sync/backgroundSync') as typeof import('../src/sync/backgroundSync');

const child: AccountState = { kind: 'signedIn', email: 'child@example.test', membership: { familyId: 'family', role: 'child' }, offline: false };
beforeEach(() => {
  jest.clearAllMocks();
  mockAccount = { kind: 'checking' };
  mockGeneration = 0;
  mockRestore.mockResolvedValue(child);
  mockRunSync.mockResolvedValue(true);
});

test('화면 없는 시작에서 계정 복원 뒤 새 서버 조회를 실행한다', async () => {
  await expect(syncFamilyInBackground()).resolves.toBe(true);
  expect(mockSetAccount).toHaveBeenCalledWith(child);
  expect(mockRunSync).toHaveBeenCalledWith({ familyId: 'family', role: 'child' }, { fresh: true });
});

test('복원 대기 중 사용자 로그아웃은 늦은 계정 복원을 취소한다', async () => {
  mockRestore.mockImplementationOnce(async () => { mockGeneration += 1; mockAccount = { kind: 'local' }; return child; });
  await expect(syncFamilyInBackground()).resolves.toBe(false);
  expect(mockSetAccount).not.toHaveBeenCalled();
  expect(mockRunSync).not.toHaveBeenCalled();
});

test('오프라인 캐시 계정은 로컬을 덮는 동기화를 시작하지 않는다', async () => {
  mockRestore.mockResolvedValueOnce({ ...child, offline: true });
  await expect(syncFamilyInBackground()).resolves.toBe(false);
  expect(mockRunSync).not.toHaveBeenCalled();
});

test('로그아웃한 로컬 모드는 서버에 접근하지 않는다', async () => {
  mockAccount = { kind: 'local' };
  await expect(syncFamilyInBackground()).resolves.toBe(true);
  expect(mockRestore).not.toHaveBeenCalled();
  expect(mockRunSync).not.toHaveBeenCalled();
});

test('로그아웃 시작 이후 실행된 작업은 이전 세션을 복원하지 않는다', async () => {
  mockGeneration = 1;
  await expect(syncFamilyInBackground()).resolves.toBe(false);
  expect(mockRestore).not.toHaveBeenCalled();
  expect(mockRunSync).not.toHaveBeenCalled();
});

test('기존 로그인도 서버 실패를 주기 실행에 전달한다', async () => {
  mockAccount = child;
  mockRunSync.mockResolvedValueOnce(false);
  await expect(syncFamilyInBackground()).resolves.toBe(false);
  expect(mockRestore).not.toHaveBeenCalled();
});
