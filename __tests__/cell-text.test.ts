import { buildCellLines, categoryText, linesThatFit } from '../src/utils/cellText';

const base = { category: 'academy', title: '리틀 포레스트', glyph: '학', hasMemo: false, hasAlert: false, fontSize: 11 } as const;

describe('일정 칸 글자 배치', () => {
  it('구분 이름이 학교·학원·돌봄·생활이다', () => {
    expect(categoryText).toEqual({ school: '학교', academy: '학원', care: '돌봄', life: '생활' });
  });

  it('칸 높이에 따라 3줄·2줄·1줄로 줄인다', () => {
    expect(linesThatFit(60, 11)).toBe(3);
    expect(linesThatFit(40, 11)).toBe(2);
    expect(linesThatFit(30, 11)).toBe(1);
    expect(linesThatFit(10, 11)).toBe(1);
    expect(linesThatFit(52, 18)).toBe(2); // 글자가 커지면 같은 높이에 덜 들어간다
  });

  it('3줄이면 구분 / 이름 / 기타(아이콘·메모·알림)로 나눈다', () => {
    expect(buildCellLines({ ...base, heightDp: 60, hasMemo: true, hasAlert: true })).toEqual({ lineCount: 3, first: '학원', title: '리틀 포레스트', extras: '학 📝 🔔' });
    expect(buildCellLines({ ...base, category: 'school', title: '수업', glyph: '가', heightDp: 60 })).toEqual({ lineCount: 3, first: '학교', title: '수업', extras: '가' });
  });

  it('2줄이면 구분과 이름만 남기고 메모·알림 표시는 구분 줄에 붙인다', () => {
    expect(buildCellLines({ ...base, heightDp: 40, hasMemo: true })).toEqual({ lineCount: 2, first: '학원 📝', title: '리틀 포레스트', extras: '' });
    expect(buildCellLines({ ...base, category: 'care', title: '돌봄', heightDp: 40 }).first).toBe('돌봄');
  });

  it('1줄이면 이름만 보여준다', () => {
    expect(buildCellLines({ ...base, heightDp: 25 })).toEqual({ lineCount: 1, first: '', title: '리틀 포레스트', extras: '' });
  });

  it('긴 이름도 글자를 바꾸지 않고 그대로 넘겨 한 줄 맞춤은 화면이 한다', () => {
    const long = '아주아주긴학원이름입니다';
    expect(buildCellLines({ ...base, title: long, heightDp: 60 }).title).toBe(long);
  });
});
