import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { GemSummaryLine } from '../src/components/GemSummaryLine';
import { defaultTheme } from '../src/theme';

const mockSummary = jest.fn();
jest.mock('../src/db/database', () => ({ getDatabase: async () => ({}) }));
jest.mock('../src/db/stickerRepository', () => ({ getStickerSummary: (...args: unknown[]) => mockSummary(...args) }));

const texts = (root: ReactTestInstance): string => root.findAll((node) => (node.type as unknown) === 'Text').map((node) => node.children.filter((value) => typeof value === 'string').join('')).join(' | ');
async function render() {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<GemSummaryLine theme={defaultTheme} refreshKey={0} onPress={() => undefined} />); });
  return tree;
}

describe('오늘 탭 보석 한 줄', () => {
  it('작은 보석과 큰 보석을 더하지 않고 각각의 개수로 보여준다', async () => {
    mockSummary.mockResolvedValue({ gems: 7, largeGems: 2, total: 9, goal: null, remaining: null });
    const line = texts((await render()).root);
    expect(line).toContain('작은 보석 7개 · 큰 보석 2개');
    expect(line).not.toContain('9개');
  });

  it('큰 보석이 없어도 0개로 따로 보여준다', async () => {
    mockSummary.mockResolvedValue({ gems: 3, largeGems: 0, total: 3, goal: null, remaining: null });
    expect(texts((await render()).root)).toContain('작은 보석 3개 · 큰 보석 0개');
  });

  it('불러오지 못하면 안내 문구를 보여준다', async () => {
    mockSummary.mockRejectedValue(new Error('db'));
    expect(texts((await render()).root)).toContain('불러오지 못했어요');
  });
});
