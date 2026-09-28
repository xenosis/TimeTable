---
paths:
  - "app/**/*.{ts,tsx}"
  - "src/**/*.{ts,tsx}"
  - "scripts/**/*.{js,cjs,mjs,ts}"
  - "dashboard/**/*.{html,css,js,cjs}"
  - ".claude/hooks/**/*.{js,cjs}"
  - ".codex/hooks/**/*.{js,cjs}"
  - "android/app/src/**/*.{java,kt}"
---

# 코드 책임 분리

- 기본 소스 파일은 300줄, 파일 선택형 단일 `dashboard/backlog-dashboard.html`은 800줄 기준을 적용한다. 생성물·의존성·데이터는 대상이 아니다.
- UI 렌더링, 상태·이벤트, 스타일·하위 컴포넌트와 도메인, 저장소/API I/O의 책임 경계로 분리한다.
- 기준 회피를 위한 코드 압축이나 의미 없는 파일 분할은 하지 않는다.
- 편집 후 PostToolUse 빠른 검사 결과를 처리하고, 완료 전 `npm run check`를 실행한다.
