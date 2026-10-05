import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GemCountEditor } from '../src/components/GemCountEditor';
import { getDatabase } from '../src/db/database';
import { updateGemCounts } from '../src/db/gemCountRepository';
import { defaultTheme } from '../src/theme';

jest.mock('../src/db/database', () => ({ getDatabase: jest.fn() }));
jest.mock('../src/db/gemCountRepository', () => ({ maximumGemCount: 9999, updateGemCounts: jest.fn() }));

describe('보석 개수 입력 예외 흐름', () => {
  let tree: ReactTestRenderer;
  let onSaved: jest.Mock;
  let onClose: jest.Mock;
  const copy = () => tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
  const button = (label: string) => tree.root.findAll((node) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((text) => text.props.children === label))[0];
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getDatabase).mockResolvedValue({} as Awaited<ReturnType<typeof getDatabase>>);
    jest.mocked(updateGemCounts).mockResolvedValue(undefined);
    onSaved = jest.fn(); onClose = jest.fn();
    act(() => { tree = create(<GemCountEditor counts={{ gems: 2, largeGems: 3 }} theme={defaultTheme} onSaved={onSaved} onClose={onClose} />); });
  });
  afterEach(() => { act(() => tree.unmount()); });

  it('취소는 장부를 쓰거나 갱신하지 않고 닫는다', () => {
    act(() => { button('취소').props.onPress(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(updateGemCounts).not.toHaveBeenCalled();
  });

  it('숫자가 아닌 입력은 안내하고 저장하지 않는다', async () => {
    act(() => { tree.root.findAll((node) => node.props.accessibilityLabel === '작은 보석 개수' && typeof node.props.onChangeText === 'function')[0].props.onChangeText(''); });
    await act(async () => { button('저장').props.onPress(); });
    expect(copy()).toContain('개수를 숫자로 적어 주세요.');
    expect(updateGemCounts).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('저장 중 입력·취소를 막고 Android 뒤로 닫기를 무시한다', async () => {
    let resolve!: () => void;
    jest.mocked(updateGemCounts).mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    await act(async () => { button('저장').props.onPress(); });
    expect(button('취소').props.disabled).toBe(true);
    expect(button('저장 중…').props.disabled).toBe(true);
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === '작은 보석 개수')[0].props.editable).toBe(false);
    act(() => { tree.root.findAll((node) => typeof node.props.onRequestClose === 'function')[0].props.onRequestClose(); });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { resolve(); });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateGemCounts).toHaveBeenCalledWith(expect.anything(), { gems: 2, largeGems: 3 });
  });

  it('저장 실패 뒤 입력값을 유지하고 재시도로 복구한다', async () => {
    jest.mocked(updateGemCounts).mockRejectedValueOnce(new Error('database busy'));
    await act(async () => { button('저장').props.onPress(); });
    expect(copy()).toContain('개수를 저장하지 못했어요. 다시 시도해 주세요.');
    expect(button('저장').props.disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { button('저장').props.onPress(); });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
