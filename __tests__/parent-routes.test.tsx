import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import HomeRoute from '../app/(tabs)/index';
import StickersRoute from '../app/(tabs)/stickers';
import { PinGate } from '../src/components/PinGate';
import { defaultTheme } from '../src/theme';
import type { AccountState } from '../src/server/account';

let mockAccount: AccountState;
const mockRedirects: string[] = [];
jest.mock('expo-router', () => ({
  router: {},
  Redirect: ({ href }: { href: string }) => { mockRedirects.push(href); return null; },
  useFocusEffect: () => undefined,
}));
jest.mock('../src/store/accountStore', () => ({
  useAccount: () => mockAccount,
  isParentDevice: (state: AccountState) => state.kind === 'signedIn' && state.membership?.role === 'parent',
}));
jest.mock('../src/theme/provider', () => ({ useActiveTheme: () => ({ theme: jest.requireActual<typeof import('../src/theme')>('../src/theme').defaultTheme, selectTheme: () => undefined }) }));
jest.mock('../src/components/ParentHome', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { ParentHome: () => <MockText>아빠 현황</MockText> };
});
jest.mock('../src/components/CharacterHeader', () => ({ CharacterHeader: () => null }));
jest.mock('../src/components/PermissionGuide', () => ({ PermissionGuide: () => null }));
jest.mock('../src/components/TodayScheduleCard', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { TodayScheduleCard: () => <MockText>딸 오늘 일정</MockText> };
});
jest.mock('../src/components/TodayTasksCard', () => ({ TodayTasksCard: () => null }));
jest.mock('../src/components/StickerBoard', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { StickerBoard: () => <MockText>보석판</MockText> };
});
jest.mock('../src/components/ThemePicker', () => ({ ThemePicker: () => null }));
jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('../src/db/timetableSetRepository', () => ({ getActiveTimetableSet: jest.fn() }));
jest.mock('../src/widgets/widgetChecksSignal', () => ({ subscribeWidgetChecksApplied: () => () => undefined }));
jest.mock('../src/security/pin', () => ({ hasPin: () => new Promise(() => undefined), getPinLockUntil: async () => 0, recordPinFailure: jest.fn(), resetPinFailures: jest.fn(), savePin: jest.fn(), verifyPin: jest.fn() }));

const parent: AccountState = { kind: 'signedIn', email: 'dad@test.com', membership: { familyId: 'family-a', role: 'parent' }, offline: false };
const child: AccountState = { kind: 'signedIn', email: 'kid@test.com', membership: { familyId: 'family-a', role: 'child' }, offline: false };

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(element); });
  return renderer;
}
const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');

test('첫 탭은 아빠 폰이면 현황, 딸 폰이면 오늘 화면을 그린다', async () => {
  mockAccount = parent;
  const parentView = await render(<HomeRoute />);
  expect(texts(parentView)).toContain('아빠 현황');
  expect(texts(parentView)).not.toContain('딸 오늘 일정');
  await act(async () => parentView.unmount());
  mockAccount = child;
  const childView = await render(<HomeRoute />);
  expect(texts(childView)).toContain('딸 오늘 일정');
  expect(texts(childView)).not.toContain('아빠 현황');
  await act(async () => childView.unmount());
});

test('아빠 폰이 보석 경로로 오면 현황으로 보낸다', async () => {
  mockRedirects.length = 0;
  mockAccount = parent;
  const view = await render(<StickersRoute />);
  expect(mockRedirects).toEqual(['/']);
  expect(texts(view)).not.toContain('보석판');
  await act(async () => view.unmount());
});

test('PIN 화면은 bypass일 때 PIN 없이 내용을 바로 보인다', async () => {
  const view = await render(<PinGate theme={defaultTheme} bypass><Text>관리 내용</Text></PinGate>);
  expect(texts(view)).toContain('관리 내용');
  await act(async () => view.unmount());
});
