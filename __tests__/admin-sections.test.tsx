import { Text } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { AdminCollapsible } from '../src/components/AdminCollapsible';
import { AdminSectionMenu } from '../src/components/AdminSectionMenu';
import { defaultTheme } from '../src/theme';
import { ADMIN_SECTIONS, CLEAN_FORM_STATE, DEFAULT_ADMIN_SECTION, decideSectionSwitch } from '../src/utils/adminSections';

const pressables = (root: ReactTestInstance) => {
  const found = root.findAll((node) => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string');
  return found.filter((node, index) => found.findIndex((other) => other.props.accessibilityLabel === node.props.accessibilityLabel) === index);
};

describe('관리자 영역 전환 규칙', () => {
  it('기본 영역은 시간표이고 메뉴는 시간표·할 일·보상·기타 순서다', () => {
    expect(DEFAULT_ADMIN_SECTION).toBe('timetable');
    expect(ADMIN_SECTIONS.map(({ label }) => label)).toEqual(['시간표', '할 일', '보상', '기타']);
  });

  it('입력이 없으면 바로 옮기고 같은 영역이면 그대로 둔다', () => {
    expect(decideSectionSwitch('timetable', 'tasks', CLEAN_FORM_STATE)).toBe('switch');
    expect(decideSectionSwitch('tasks', 'tasks', { dirty: true, saving: true })).toBe('stay');
  });

  it('저장하지 않은 입력이 있으면 확인을 거치고, 저장 중이면 옮기지 못하게 막는다', () => {
    expect(decideSectionSwitch('timetable', 'etc', { dirty: true, saving: false })).toBe('confirm');
    expect(decideSectionSwitch('timetable', 'etc', { dirty: true, saving: true })).toBe('blocked');
    expect(decideSectionSwitch('timetable', 'etc', { dirty: false, saving: true })).toBe('blocked');
  });
});

describe('AdminSectionMenu', () => {
  it('네 영역을 탭으로 보여주고 선택 상태를 알리며 누른 영역을 전달한다', () => {
    const onSelect = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<AdminSectionMenu selected="tasks" onSelect={onSelect} theme={defaultTheme} />); });
    const tabs = pressables(tree.root);
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(['시간표 영역', '할 일 영역', '보상 영역', '기타 영역']);
    expect(tabs.filter((tab) => tab.props.accessibilityState.selected).map((tab) => tab.props.accessibilityLabel)).toEqual(['할 일 영역']);
    act(() => { tabs[3].props.onPress(); });
    expect(onSelect).toHaveBeenCalledWith('etc');
  });
});

describe('AdminCollapsible', () => {
  it('처음에는 제목만 보이고 내용은 만들지 않으며, 눌러서 펼치고 접는다', () => {
    const Probe = jest.fn(() => <Text>내용</Text>);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<AdminCollapsible title="기기 테스트" theme={defaultTheme}><Probe /></AdminCollapsible>); });
    expect(Probe).not.toHaveBeenCalled();
    const header = () => pressables(tree.root)[0];
    expect(header().props.accessibilityState.expanded).toBe(false);
    act(() => { header().props.onPress(); });
    expect(Probe).toHaveBeenCalled();
    expect(header().props.accessibilityState.expanded).toBe(true);
    act(() => { header().props.onPress(); });
    expect(header().props.accessibilityState.expanded).toBe(false);
  });
});
