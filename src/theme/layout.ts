// 화면 구조 전반에서 공유하는 레이아웃 토큰이다. 테마 색·의미 키와 분리한다.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 999,
} as const;

export const touchTarget = { minimum: 56 } as const;

// 아이 화면 글자 단계. 기기 기본 글꼴보다 조금 큰 정도로 두고, 더 크게는 기기 글꼴 설정으로 키운다
export const fontSize = {
  sm: 14,
  md: 17,
  lg: 22,
  xl: 28,
  xxl: 36,
} as const;
