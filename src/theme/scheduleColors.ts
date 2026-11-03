import type { TimetableCategory } from '../db/types';
import { colorKeys, type ColorKey, type ThemeCategory } from './index';
import { contrastRatio } from './contrast';

/** 종류는 공통 띠 색, 과목은 명도와 색상이 다른 팔레트로 구분한다. 저장된 키는 보존한다. */
export const scheduleColorFamilies: Readonly<Record<TimetableCategory, { base: string; text: string }>> = {
  school: { base: '#2563EB', text: '#172554' },
  after_school: { base: '#059669', text: '#064E3B' },
  academy: { base: '#9333EA', text: '#3B0764' },
  care: { base: '#D97706', text: '#78350F' },
  life: { base: '#64748B', text: '#1E293B' },
};

const labels: Readonly<Record<ColorKey, string>> = {
  korean: '국어·읽기', math: '수학·주산', english: '영어', science: '과학·탐구',
  music: '음악·피아노', art: '미술·만들기', 'physical-education': '체육·운동',
  academy: '기타 수업', life: '일상', other: '자동 (이름별)',
};
// 같은 색의 흰색 혼합만으로 구분하지 않는다. 파랑/초록/보라 계열 안에서 색상과 진하기를 바꾼다.
const palettes: Readonly<Record<TimetableCategory, readonly string[]>> = {
  school: ['#DBEAFE', '#60A5FA', '#38BDF8', '#1E40AF', '#A5B4FC', '#818CF8', '#0E7490', '#312E81', '#BAE6FD', '#2563EB'],
  after_school: ['#D9F99D', '#4ADE80', '#2DD4BF', '#15803D', '#A3E635', '#047857', '#5EEAD4', '#365314', '#BBF7D0', '#10B981'],
  academy: ['#F5D0FE', '#A78BFA', '#F0ABFC', '#6D28D9', '#BE185D', '#DB2777', '#818CF8', '#4C1D95', '#C7D2FE', '#9333EA'],
  care: ['#FEF08A', '#FB923C', '#FCD34D', '#B45309', '#FDBA74', '#F97316', '#A3A014', '#78350F', '#FED7AA', '#D97706'],
  life: ['#E2E8F0', '#94A3B8', '#A5C5D6', '#475569', '#C4B5CE', '#9B7C9F', '#4D9C91', '#334155', '#CBD5E1', '#64748B'],
};

export function readableScheduleText(background: string): string {
  return contrastRatio('#000000', background) >= contrastRatio('#FFFFFF', background) ? '#000000' : '#FFFFFF';
}

function nameColorIndex(title: string): number {
  let hash = 2166136261;
  for (const char of title.normalize('NFC').replace(/\s+/g, '').toLowerCase()) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return (hash >>> 0) % colorKeys.length;
}

/**
 * 이동 일정('돌봄 → 일루스터'처럼 화살표가 든 이름)은 종류·저장된 색과 상관없이 한 색으로 통일한다.
 * 어느 종류의 팔레트에도 없는 색이라 일반 일정과 겹치지 않는다. 띠 색도 종류 대신 이 색 계열로 고정한다.
 */
const MOVE_COLOR = '#D6D3D1';
export const MOVE_STRIPE_COLOR = '#78716C';

export function isMoveTitle(title: string | null | undefined): boolean {
  return /→|->/.test(title ?? '');
}

/** 칸 왼쪽 띠 색: 이동 일정은 고정, 나머지는 종류별 색 */
export function scheduleStripeColor(category: TimetableCategory, title?: string): string {
  return isMoveTitle(title) ? MOVE_STRIPE_COLOR : scheduleColorFamilies[category].base;
}

export function resolveScheduleColor(category: TimetableCategory, colorKey: string | null | undefined, title?: string): ThemeCategory {
  if (isMoveTitle(title)) return { key: 'other', label: '이동', backgroundColor: MOVE_COLOR, textColor: readableScheduleText(MOVE_COLOR) };
  const index = colorKeys.findIndex((key) => key === colorKey);
  const key = index < 0 ? 'other' : colorKeys[index];
  const palette = palettes[category] ?? palettes.life;
  const resolvedIndex = key === 'other' && title?.trim() ? nameColorIndex(title) : colorKeys.indexOf(key);
  const backgroundColor = palette[resolvedIndex];
  return { key, label: labels[key], backgroundColor, textColor: readableScheduleText(backgroundColor) };
}
