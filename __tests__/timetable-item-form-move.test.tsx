import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { emptyTimetableDraft, TimetableItemForm } from '../src/components/TimetableItemForm';
import { defaultTheme } from '../src/theme';

const labels = (root: ReactTestInstance) => root.findAll((node) => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string').map((node) => node.props.accessibilityLabel as string);

function render(title: string) {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<TimetableItemForm draft={{ ...emptyTimetableDraft(1), title, category: 'life' }} onChange={() => undefined} periods={[]} theme={defaultTheme} saving={false} onRemove={() => undefined} />); });
  return tree;
}

it('이동 일정은 색을 고를 수 없고 모두 같은 색이라고 알려 준다', () => {
  const tree = render('돌봄 → 일루스터');
  try {
    expect(labels(tree.root)).toContain('이동 일정은 모두 같은 색으로 보여요');
    expect(labels(tree.root).some((label) => label.endsWith('바꾸기') && label.startsWith('색 '))).toBe(false);
  } finally { act(() => tree.unmount()); }
});

it('이동이 아닌 일정은 지금처럼 색을 고를 수 있다', () => {
  const tree = render('점심');
  try {
    expect(labels(tree.root).some((label) => label.startsWith('색 ') && label.endsWith('바꾸기'))).toBe(true);
    expect(labels(tree.root)).not.toContain('이동 일정은 모두 같은 색으로 보여요');
  } finally { act(() => tree.unmount()); }
});
