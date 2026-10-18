import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import TabsLayout from '../app/(tabs)/_layout';
import type { AccountState } from '../src/server/account';

let mockAccount: AccountState;
let mockPathname = '/';
let mockImmersive = false;
jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    usePathname: () => mockPathname,
    router: { replace: jest.fn(), push: jest.fn() },
    Slot: () => <MockText>탭 화면 슬롯</MockText>,
    Stack: { Screen: () => null },
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/store/accountStore', () => ({
  useAccount: () => mockAccount,
  isParentDevice: (state: AccountState) => state.kind === 'signedIn' && state.membership?.role === 'parent',
}));
jest.mock('../src/theme/provider', () => ({ useActiveTheme: () => ({ theme: jest.requireActual<typeof import('../src/theme')>('../src/theme').defaultTheme }) }));
jest.mock('../src/store/immersiveMode', () => ({ useImmersive: () => mockImmersive }));
jest.mock('../src/components/GemCollectionArtwork', () => ({ GemCollectionArtwork: () => null }));

const parent: AccountState = { kind: 'signedIn', email: 'dad@test.com', membership: { familyId: 'family-a', role: 'parent' }, offline: false };
const child: AccountState = { kind: 'signedIn', email: 'kid@test.com', membership: { familyId: 'family-a', role: 'child' }, offline: false };

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<TabsLayout />); });
  return renderer;
}

const texts = (renderer: ReactTestRenderer) => renderer.root.findAllByType(Text).map((node) => node.props.children);
const tabs = (renderer: ReactTestRenderer) => renderer.root.findAll((node) => node.props.accessibilityRole === 'tab' && typeof node.type !== 'string' && node.props.onPress)
  .map((node) => ({ label: node.props.accessibilityLabel as string, selected: Boolean(node.props.accessibilityState?.selected) }))
  .filter((tab, index, all) => all.findIndex((other) => other.label === tab.label) === index);
const selected = (renderer: ReactTestRenderer) => tabs(renderer).filter((tab) => tab.selected).map(({ label }) => label);

beforeEach(() => { mockPathname = '/'; mockImmersive = false; });

test('아빠 기기는 현황·시간표·설정 탭만 보이고 보석 탭은 없다', async () => {
  mockAccount = parent;
  const renderer = await render();
  expect(tabs(renderer).map(({ label }) => label)).toEqual(['현황 탭', '시간표 탭', '설정 탭']);
  expect(selected(renderer)).toEqual(['현황 탭']);
});

test('딸 기기 탭은 오늘·시간표·내 보석·설정이다', async () => {
  mockAccount = child;
  const renderer = await render();
  expect(tabs(renderer).map(({ label }) => label)).toEqual(['오늘 탭', '시간표 탭', '내 보석 탭', '설정 탭']);
});

test('어느 탭이든 하위 화면(Slot)을 항상 그린다(아빠 폰 무한 렌더링 회귀 방지)', async () => {
  for (const account of [parent, child]) {
    for (const path of ['/', '/timetable', '/manage']) {
      mockAccount = account;
      mockPathname = path;
      const renderer = await render();
      expect(texts(renderer)).toContain('탭 화면 슬롯');
      await act(async () => renderer.unmount());
    }
  }
});

test('설정 화면에서도 탭바가 남아 있고 설정 탭이 선택된다', async () => {
  mockAccount = parent;
  mockPathname = '/manage';
  const renderer = await render();
  expect(selected(renderer)).toEqual(['설정 탭']);
});

test('가로 주간 보기(몰입 모드)에서는 탭바를 숨긴다', async () => {
  mockAccount = parent;
  mockPathname = '/timetable';
  mockImmersive = true;
  const renderer = await render();
  expect(tabs(renderer)).toEqual([]);
});
