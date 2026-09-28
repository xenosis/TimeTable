---
paths:
  - "docs/**/*.md"
  - "backlog.json"
  - "app/**"
  - "src/**"
  - "scripts/**"
  - "dashboard/**"
---

# 문서 갱신 시점

- 백로그 상태나 구현 결과가 달라진 뒤 관련 `docs/backlog/<ID>.md`와 검토 문서의 기준 SHA-256을 갱신한다.
- 문서화 완료와 개발 작업 완료를 구별한다. 요구사항에 없는 내용은 질문으로 남기고 필요한 경우 `needs_info`로 기록한다.
- JSON 변경 뒤 `npm run dashboard`에서 최신 상태와 참조 오류를 확인한다. 대시보드는 읽기 전용이며 표시된 `gate`를 실행하지 않는다.
