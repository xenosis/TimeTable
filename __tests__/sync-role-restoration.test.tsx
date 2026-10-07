import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { AccountState } from '../src/server/account';
import { SyncLifecycle } from '../src/sync/SyncLifecycle';

let mockAccount: AccountState;
const mockPolicy = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
jest.mock('../src/store/accountStore', () => ({
  useAccount: () => mockAccount, getAccount: () => mockAccount,
  isParentDevice: (account: AccountState) => account.kind === 'signedIn' && account.membership?.role === 'parent',
}));
jest.mock('../src/notifications/secureAlarmPoc', () => ({ syncDeviceAlarmPolicy: () => mockPolicy() }));
jest.mock('../src/notifications/parentDeviceAlarms', () => ({ suppressChildAlarms: () => mockAccount.kind !== 'signedIn' || mockAccount.membership?.role !== 'child' }));
jest.mock('../src/notifications/rollingOwners', () => ({ refreshAllRollingOwners: () => mockRefresh() }));
jest.mock('../src/sync/syncRunner', () => ({ runSync: async () => true, syncTarget: (account: AccountState) => account.kind === 'signedIn' ? account.membership : null }));
jest.mock('../src/sync/syncSoon', () => ({ registerSyncSoonRunner: jest.fn() }));
jest.mock('../src/sync/adminEdit', () => ({ runAdminEdit: jest.fn() }));
jest.mock('../src/sync/adminEditGate', () => ({ registerAdminEditRunner: jest.fn() }));
jest.mock('../src/sync/realtimeSync', () => ({ subscribeFamilyChanges: () => () => undefined }));

test('로그인 종류가 같아도 미확인 소속에서 딸 역할로 복원되면 네이티브 정책을 다시 적용한다', async () => {
  jest.clearAllMocks();
  mockAccount = { kind: 'signedIn', email: 'kid@test.com', membership: null, offline: true };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<SyncLifecycle />); });
  expect(mockPolicy).toHaveBeenCalledTimes(1);
  expect(mockRefresh).not.toHaveBeenCalled();
  mockAccount = { ...mockAccount, membership: { familyId: 'family-a', role: 'child' }, offline: false };
  await act(async () => { renderer.update(<SyncLifecycle />); });
  expect(mockPolicy).toHaveBeenCalledTimes(2);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});
