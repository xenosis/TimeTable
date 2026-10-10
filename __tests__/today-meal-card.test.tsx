import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TodayMealCard } from '../src/components/TodayMealCard';
import { loadTodayMeal } from '../src/neis/meals';
import { defaultTheme } from '../src/theme';

jest.mock('../src/neis/meals', () => ({ loadTodayMeal: jest.fn() }));
const copy = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');

describe('오늘의 급식 카드', () => {
  let tree: ReactTestRenderer;
  afterEach(() => act(() => tree.unmount()));

  it('오늘 메뉴를 한 줄씩 보여 준다', async () => {
    jest.mocked(loadTodayMeal).mockResolvedValueOnce({ status: 'ready', kind: '중식', dishes: ['칼슘쌀밥', '쇠고기미역국'], calories: '657.7 Kcal' });
    await act(async () => { tree = create(<TodayMealCard theme={defaultTheme} refreshKey={0} />); });
    expect(copy(tree)).toContain('오늘의 급식');
    expect(copy(tree)).toContain('칼슘쌀밥');
    expect(copy(tree)).toContain('657.7 Kcal');
  });

  it('학교를 정하지 않았으면 카드를 그리지 않고, 급식이 없거나 못 불러오면 짧게 알린다', async () => {
    jest.mocked(loadTodayMeal).mockResolvedValueOnce({ status: 'no-school' });
    await act(async () => { tree = create(<TodayMealCard theme={defaultTheme} refreshKey={0} />); });
    expect(tree.toJSON()).toBeNull();
    jest.mocked(loadTodayMeal).mockResolvedValueOnce({ status: 'none' });
    await act(async () => { tree.update(<TodayMealCard theme={defaultTheme} refreshKey={1} />); });
    expect(copy(tree)).toContain('오늘은 급식이 없어요.');
    jest.mocked(loadTodayMeal).mockResolvedValueOnce({ status: 'error', message: 'x' });
    await act(async () => { tree.update(<TodayMealCard theme={defaultTheme} refreshKey={2} />); });
    expect(copy(tree)).toContain('급식을 불러오지 못했어요');
  });
});
