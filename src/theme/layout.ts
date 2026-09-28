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

export const fontSize = {
  sm: 16,
  md: 20,
  lg: 28,
  xl: 36,
  xxl: 48,
} as const;
