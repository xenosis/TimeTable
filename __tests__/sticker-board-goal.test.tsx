import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StickerBoard } from '../src/components/StickerBoard';
import { getStickerSummary, type StickerSummary } from '../src/db/stickerRepository';
import { defaultTheme } from '../src/theme';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn(async () => ({})) }));
jest.mock('../src/db/stickerRepository', () => ({ getStickerSummary: jest.fn() }));
jest.mock('../src/db/gemRightRepository', () => ({ currentStreak: jest.fn(async () => 0) }));
// 그림·자격 카드·입력창은 이 테스트의 대상(목표 표시)이 아니므로 비운다
jest.mock('../src/components/GemArtwork', () => ({ GemArtwork: () => null }));
jest.mock('../src/components/GemCollectionArtwork', () => ({ GemCollectionArtwork: () => null }));
jest.mock('../src/components/GemRightsCard', () => ({ GemRightsCard: () => null }));
jest.mock('../src/components/GemCountEditor', () => ({ GemCountEditor: () => null }));

const goal = { id: 1, title: '레고 세트', stickerGoal: 10 } as NonNullable<StickerSummary['goal']>;
const summary = (gems: number, largeGems: number, withGoal: boolean): StickerSummary => ({
  gems, largeGems, total: gems + largeGems, goal: withGoal ? goal : null,
  remaining: withGoal ? Math.max(0, goal.stickerGoal - gems - largeGems) : null,
});

async function render(value: StickerSummary) {
  jest.mocked(getStickerSummary).mockResolvedValueOnce(value);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<StickerBoard theme={defaultTheme} refreshKey={0} />); });
  const copy = tree.root.findAllByType(Text).map((node) => node.props.children).flat(3).join(' ');
  const bar = tree.root.findAll((node) => node.props.accessibilityRole === 'progressbar' && typeof node.type === 'string')[0];
  return { tree, copy, bar };
}

describe('내 보석 선물 목표 표시', () => {
  it('목표가 없으면 목표를 정해 보자는 안내만 보인다', async () => {
    const { tree, copy, bar } = await render(summary(3, 1, false));
    expect(copy).toContain('다음 보상 목표를 정해 보세요');
    expect(bar).toBeUndefined();
    act(() => tree.unmount());
  });

  it('목표 미달이면 남은 개수와 진행률을 작은·큰 보석 각 1개로 센다', async () => {
    const { tree, copy, bar } = await render(summary(3, 2, true));
    expect(copy).toContain('레고 세트');
    expect(copy).toContain('보석 5개 더 모으면 만날 수 있어요');
    expect(copy).not.toContain('목표 달성');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 10, now: 5 });
    act(() => tree.unmount());
  });

  it('목표를 채우면 달성 문구가 보이고 진행률은 목표에서 멈춘다', async () => {
    const { tree, copy, bar } = await render(summary(9, 3, true));
    expect(copy).toContain('목표를 채웠어요! 아빠에게 알려 주세요.');
    expect(copy).toContain('목표 달성 ✨');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 10, now: 10 });
    act(() => tree.unmount());
  });
});
