import { Alert } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { GemRequestsPanel } from '../src/components/GemRequestsPanel';
import { GemRightsCard } from '../src/components/GemRightsCard';
import { defaultTheme } from '../src/theme';
import { setAccount } from '../src/store/accountStore';
import { notifyWidgetChecksApplied } from '../src/widgets/widgetChecksSignal';

const mockSummary = jest.fn();
const mockRequest = jest.fn();
const mockGiven = jest.fn();
jest.mock('../src/server/parentGemGiven', () => ({ markParentGemsGiven: jest.fn(), pendingParentGemCount: () => 0 }));
jest.mock('../src/server/parentGemRecovery', () => ({ loadParentGemRecovery: jest.fn(), confirmParentGemRecovery: jest.fn() }));
jest.mock('../src/sync/syncMarkers', () => ({ hasSyncedFamily: () => true }));
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({}) }));
jest.mock('../src/db/gemRightRepository', () => ({
  getGemRightSummary: (...args: unknown[]) => mockSummary(...args),
  requestAvailableRights: (...args: unknown[]) => mockRequest(...args),
  markRequestedGiven: (...args: unknown[]) => mockGiven(...args),
}));

const summary = (overrides: Partial<Record<'available' | 'requested' | 'given' | 'streak' | 'daysToNext', number>> = {}) => ({ available: 0, requested: 0, given: 0, streak: 0, daysToNext: 5, ...overrides });
const texts = (node: ReactTestInstance): string => node.findAll((child) => (child.type as unknown) === 'Text').map((child) => child.children.filter((value) => typeof value === 'string').join('')).join(' | ');
const press = (root: ReactTestInstance, label: string) => {
  const target = root.findAll((node) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0];
  return act(async () => { target.props.onPress(); });
};
const mountedTrees: ReturnType<typeof create>[] = [];
async function render(element: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(element); });
  mountedTrees.push(tree);
  return tree;
}

beforeEach(() => { setAccount({ kind: 'local' }); mockSummary.mockReset(); mockRequest.mockReset(); mockGiven.mockReset(); });
afterEach(async () => {
  await act(async () => { for (const tree of mountedTrees.splice(0)) tree.unmount(); });
  setAccount({ kind: 'local' });
});

test('아빠 보석 패널은 동기화 완료 신호를 받으면 새 요청을 보여준다', async () => {
  setAccount({ kind: 'signedIn', email: 'dad@example.invalid', membership: { role: 'parent', familyId: 'fam-a' }, offline: false });
  mockSummary.mockResolvedValue(summary());
  const tree = await render(<GemRequestsPanel theme={defaultTheme} />);
  expect(texts(tree.root)).toContain('지금 요청한 보석은 없어요');
  mockSummary.mockResolvedValue(summary({ requested: 2 }));
  await act(async () => { notifyWidgetChecksApplied(); });
  expect(texts(tree.root)).toContain('요청 2개');
  await act(async () => tree.unmount());
});

test('지급 개수를 직접 입력한 뒤 동기화가 와도 입력을 유지한다', async () => {
  mockSummary.mockResolvedValue(summary({ requested: 3 }));
  const tree = await render(<GemRequestsPanel theme={defaultTheme} />);
  await act(async () => tree.root.findByProps({ accessibilityLabel: '준 보석 개수' }).props.onChangeText('1'));
  mockSummary.mockResolvedValue(summary({ requested: 4 }));
  await act(async () => notifyWidgetChecksApplied());
  expect(tree.root.findByProps({ accessibilityLabel: '준 보석 개수' }).props.value).toBe('1');
  expect(texts(tree.root)).toContain('요청 4개');
});

describe('딸 화면: 보석 받기 카드', () => {
  it('연속이 없으면 시작 안내를, 진행 중이면 남은 일수를 보여주고 요청 버튼은 없다', async () => {
    mockSummary.mockResolvedValue(summary());
    expect(texts((await render(<GemRightsCard theme={defaultTheme} refreshKey={0} />)).root)).toContain('연속이 시작돼요');
    mockSummary.mockResolvedValue(summary({ streak: 3, daysToNext: 2 }));
    const tree = await render(<GemRightsCard theme={defaultTheme} refreshKey={0} />);
    expect(texts(tree.root)).toContain('3일 연속으로 해냈어요!');
    expect(texts(tree.root)).toContain('2일 더 하면 보석을 받을 수 있어요');
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === '아빠한테 보석 달라고 하기')).toHaveLength(0);
  });

  it('받을 수 있는 자격이 있으면 개수와 요청 버튼을 보여주고, 누르면 요청한다', async () => {
    mockSummary.mockResolvedValue(summary({ streak: 10, daysToNext: 5, available: 2 }));
    mockRequest.mockResolvedValue(2);
    const tree = await render(<GemRightsCard theme={defaultTheme} refreshKey={0} />);
    expect(texts(tree.root)).toContain('받을 수 있는 보석 2개');
    mockSummary.mockResolvedValue(summary({ streak: 10, requested: 2 }));
    await press(tree.root, '아빠한테 보석 달라고 하기');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(texts(tree.root)).toContain('아빠에게 보석 2개를 달라고 했어요!');
    expect(texts(tree.root)).toContain('보석 2개를 달라고 했어요. 조금만 기다려요');
  });

  it('요청 중인 개수만 있으면 기다리라는 문구만 보이고 버튼은 없다', async () => {
    mockSummary.mockResolvedValue(summary({ streak: 5, requested: 1 }));
    const tree = await render(<GemRightsCard theme={defaultTheme} refreshKey={0} />);
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === '아빠한테 보석 달라고 하기')).toHaveLength(0);
    expect(texts(tree.root)).toContain('보석 1개를 달라고 했어요');
  });
});

describe('아빠 화면: 보석 요청 패널', () => {
  it('요청이 있으면 기본으로 전체 개수를 채워 두고, 줬어요를 누르면 그 개수만큼 지급 처리한다', async () => {
    mockSummary.mockResolvedValue(summary({ requested: 2, available: 1, given: 3 }));
    mockGiven.mockResolvedValue(1);
    const tree = await render(<GemRequestsPanel theme={defaultTheme} />);
    expect(texts(tree.root)).toContain('요청 2개 · 아직 요청 안 함 1개 · 지금까지 받음 3개');
    const input = tree.root.findByProps({ accessibilityLabel: '준 보석 개수' });
    expect(input.props.value).toBe('2');
    await act(async () => { input.props.onChangeText('1'); });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await press(tree.root, '보석을 줬어요');
    expect(mockGiven).not.toHaveBeenCalled(); // 확인을 거치기 전에는 기록하지 않는다
    expect(alert.mock.calls[0][0]).toContain('1개를 줬다고 기록할까요');
    const confirm = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((button) => button.text === '기록하기')!;
    await act(async () => { confirm.onPress!(); });
    alert.mockRestore();
    expect(mockGiven).toHaveBeenCalledWith(expect.anything(), 1);
    expect(texts(tree.root)).toContain('앱의 보석 개수는 바뀌지 않아요');
  });

  it('숫자가 아니면 지급 처리를 하지 않고 안내하며, 저장소 오류는 그대로 보여준다', async () => {
    mockSummary.mockResolvedValue(summary({ requested: 1 }));
    const tree = await render(<GemRequestsPanel theme={defaultTheme} />);
    await act(async () => { tree.root.findByProps({ accessibilityLabel: '준 보석 개수' }).props.onChangeText('abc'); });
    await press(tree.root, '보석을 줬어요');
    expect(mockGiven).not.toHaveBeenCalled();
    expect(texts(tree.root)).toContain('숫자로 적어 주세요');
    await act(async () => { tree.root.findByProps({ accessibilityLabel: '준 보석 개수' }).props.onChangeText('5'); });
    mockGiven.mockRejectedValue(new Error('요청된 보석은 1개예요.'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { void buttons?.find((button) => button.text === '기록하기')?.onPress?.(); });
    await press(tree.root, '보석을 줬어요');
    alert.mockRestore();
    expect(texts(tree.root)).toContain('요청된 보석은 1개예요.');
  });

  it('요청이 없으면 입력칸 없이 안내만 보인다', async () => {
    mockSummary.mockResolvedValue(summary());
    const tree = await render(<GemRequestsPanel theme={defaultTheme} />);
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === '준 보석 개수')).toHaveLength(0);
    expect(texts(tree.root)).toContain('지금 요청한 보석은 없어요');
    expect(texts(tree.root)).toContain('5일 연속될 때마다 보석 1개');
  });
});
