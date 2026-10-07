import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * 열린 키보드의 높이(dp). 키보드가 닫히면 0이다.
 * Android의 Modal은 별도 창이라 화면의 KeyboardAvoidingView가 적용되지 않고, 창 크기도 키보드에 맞춰 줄지 않는다.
 * 그래서 모달 안 스크롤 영역 아래에 이 높이만큼 여백을 더해, 키보드가 열린 채로도 저장·취소 버튼까지 스크롤할 수 있게 한다(P9.7).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setInset(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setInset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return inset;
}
