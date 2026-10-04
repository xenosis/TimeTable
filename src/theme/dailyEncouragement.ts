export type DailyEncouragement = { readonly title: string; readonly subtitle: string };
const messages: readonly DailyEncouragement[] = [
  { title: '오늘은 작은 모험!', subtitle: '처음 해보는 일도 천천히 시작해 봐요.' },
  { title: '네 속도로 가도 좋아', subtitle: '조금씩 나아가는 것도 멋진 일이야.' },
  { title: '실수해도 괜찮아', subtitle: '다시 해보면 새로운 걸 배울 수 있어.' },
  { title: '넌 소중한 사람이야', subtitle: '잘한 날도, 쉬어가는 날도 똑같이 소중해.' },
  { title: '궁금한 걸 찾아봐!', subtitle: '왜 그럴까? 네 질문이 멋진 발견의 시작이야.' },
  { title: '작은 용기를 꺼내봐', subtitle: '도와달라고 말하는 것도 용기야.' },
  { title: '오늘도 네 편이야', subtitle: '혼자 어려우면 함께 해보자.' },
  { title: '한 걸음이면 충분해', subtitle: '모든 걸 한 번에 하지 않아도 괜찮아.' },
  { title: '네 생각을 들려줘', subtitle: '다른 생각도 서로 듣다 보면 재미있어.' },
  { title: '웃을 일 하나 찾기!', subtitle: '작은 즐거움도 마음을 반짝이게 해.' },
  { title: '어제보다 조금 더', subtitle: '남과 비교하지 말고 네 걸음을 바라봐.' },
  { title: '따뜻한 말 한마디', subtitle: '친구에게도, 너 자신에게도 다정하게 말해봐.' },
  { title: '쉬었다 가도 좋아', subtitle: '마음과 몸이 쉬면 다시 힘이 생겨.' },
  { title: '새로운 방법도 좋아', subtitle: '한 가지 방법만 정답인 건 아니야.' },
  { title: '네 마음도 챙겨줘', subtitle: '기쁜 마음도 속상한 마음도 말해도 괜찮아.' },
  { title: '작은 친절은 큰 힘!', subtitle: '함께 웃을 수 있는 일을 하나 해볼까?' },
  { title: '해보려는 네가 멋져', subtitle: '결과보다 시작해본 용기를 기억해.' },
  { title: '반짝이는 너의 하루', subtitle: '오늘 만나는 작은 순간들을 즐겨봐.' },
  { title: '하나씩 차근차근', subtitle: '작게 나누면 어려운 일도 해볼 만해.' },
  { title: '너만의 멋을 찾아봐', subtitle: '네가 좋아하는 것, 잘하는 것이 모두 달라도 좋아.' },
];

/** Local calendar day, stable across restarts and hour/DST changes; entirely offline. */
export function dailyEncouragement(date: Date): DailyEncouragement {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return messages[((day % messages.length) + messages.length) % messages.length]!;
}
