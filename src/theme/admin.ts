// 관리자(아빠) 화면 전용 크기 기준. 아이가 보는 화면의 큰 글씨·넓은 여백 토큰(spacing, fontSize)과 분리해,
// 한 화면에 더 많은 설정을 담으면서도 손가락으로 누를 수 있는 48dp 조작 영역은 지킨다.
export const adminFontSize = { body: 15, label: 14, title: 19 } as const;
export const adminSpacing = { xs: 8, sm: 12, md: 16 } as const;
/** 관리자 화면에서 누르는 모든 조작 요소의 최소 높이(dp) */
export const adminTouchTarget = 48;
