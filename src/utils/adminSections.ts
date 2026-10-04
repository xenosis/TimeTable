/** 관리자 화면의 영역(한 번에 한 영역만 표시)과 영역 이동 규칙. */
export const ADMIN_SECTIONS = [
  { key: 'timetable', label: '시간표' },
  { key: 'tasks', label: '할 일' },
  { key: 'rewards', label: '보상' },
  { key: 'etc', label: '기타' },
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number]['key'];
export const DEFAULT_ADMIN_SECTION: AdminSectionKey = 'timetable';

/** 편집 폼이 위로 알리는 상태. dirty: 저장하지 않은 입력이 있음, saving: 저장·삭제 중 */
export type AdminFormState = { readonly dirty: boolean; readonly saving: boolean };
export const CLEAN_FORM_STATE: AdminFormState = { dirty: false, saving: false };

export type SectionSwitchDecision = 'switch' | 'confirm' | 'blocked' | 'stay';

/**
 * 영역(또는 시간표 세트)을 옮기려 할 때의 판단.
 * 같은 영역이면 그대로 두고, 저장 중이면 막고, 저장하지 않은 입력이 있으면 버려도 되는지 묻는다.
 */
export function decideSectionSwitch(current: AdminSectionKey, next: AdminSectionKey, form: AdminFormState): SectionSwitchDecision {
  if (current === next) return 'stay';
  if (form.saving) return 'blocked';
  return form.dirty ? 'confirm' : 'switch';
}
