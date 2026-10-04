import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { AdminWeekdayPicker } from '../src/components/AdminWeekdayPicker';
import { defaultTheme } from '../src/theme';

function render(props: Partial<React.ComponentProps<typeof AdminWeekdayPicker>> & { onChange?: jest.Mock }) {
  const onChange = props.onChange ?? jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<AdminWeekdayPicker selected={[]} mode="multi" theme={defaultTheme} {...props} onChange={onChange} />); });
  // 요일 칸마다 가장 바깥의 누를 수 있는 요소 하나씩(라벨 기준 중복 제거)
  const found = tree.root.findAll((node) => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string');
  const chips = found.filter((node, index) => found.findIndex((other) => other.props.accessibilityLabel === node.props.accessibilityLabel) === index);
  return { chips, onChange };
}

const label = (chip: ReactTestInstance) => chip.props.accessibilityLabel as string;
const chipFor = (chips: ReactTestInstance[], name: string) => chips.find((chip) => label(chip) === `${name}요일`)!;

describe('AdminWeekdayPicker 렌더', () => {
  it('월~일 7개를 버튼으로 이 순서대로 보여준다', () => {
    const { chips } = render({});
    expect(chips.map(label)).toEqual(['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']);
    expect(chips.every((chip) => chip.props.accessibilityRole === 'button')).toBe(true);
  });

  it('선택된 요일만 selected 상태로 알린다', () => {
    const { chips } = render({ selected: [0, 3] });
    const selected = chips.filter((chip) => chip.props.accessibilityState.selected).map(label);
    expect(selected).toEqual(['수요일', '일요일']);
  });

  it('일요일을 누르면 저장값 0으로 선택값이 바뀐다(다중)', () => {
    const { chips, onChange } = render({ selected: [3] });
    act(() => { chipFor(chips, '일').props.onPress(); });
    expect(onChange).toHaveBeenCalledWith([0, 3]);
  });

  it('단일 모드에서는 누른 요일 하나만 전달한다', () => {
    const { chips, onChange } = render({ selected: [1], mode: 'single' });
    act(() => { chipFor(chips, '금').props.onPress(); });
    expect(onChange).toHaveBeenCalledWith([5]);
  });

  it('비활성이면 모든 칸이 disabled 상태로 알리고 눌러도 선택이 바뀌지 않는다', () => {
    const { chips, onChange } = render({ disabled: true });
    expect(chips.every((chip) => chip.props.disabled === true && chip.props.accessibilityState.disabled === true)).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
