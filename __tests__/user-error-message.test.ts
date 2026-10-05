import { userErrorMessage } from '../src/utils/userErrorMessage';

describe('화면에 보여 줄 오류 문구', () => {
  it('저장소의 한글 검증 문구는 그대로 쓴다', () => {
    expect(userErrorMessage(new Error('반복 요일을 하나 이상 선택해 주세요.'), '다시 시도해 주세요.')).toBe('반복 요일을 하나 이상 선택해 주세요.');
  });
  it('SQLite 같은 영어 내부 오류와 Error가 아닌 값은 일반 문구로 바꾼다', () => {
    expect(userErrorMessage(new Error('database is locked'), '다시 시도해 주세요.')).toBe('다시 시도해 주세요.');
    expect(userErrorMessage('CHECK constraint failed', '다시 시도해 주세요.')).toBe('다시 시도해 주세요.');
  });
});
