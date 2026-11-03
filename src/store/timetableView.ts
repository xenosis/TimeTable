import { create } from 'zustand';

/** 주간/요일별 화면 전환 중 접기 선택을 유지한다. 데이터·알림·학교 가져오기는 바꾸지 않는다. */
export const useTimetableView = create<{
  schoolExpanded: boolean;
  toggleSchool: () => void;
}>((set) => ({
  schoolExpanded: false,
  toggleSchool: () => set((state) => ({ schoolExpanded: !state.schoolExpanded })),
}));
