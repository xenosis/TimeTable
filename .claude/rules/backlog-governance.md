---
paths:
  - "backlog.json"
  - "scripts/backlog/**"
  - "docs/backlog-cli.md"
  - "docs/backlog-review.md"
  - "docs/backlog/**"
---

# 백로그 변경 규칙

- 기준 JSON 조회·변경은 `npm run backlog -- ...`만 사용한다. `gate` 문자열은 표시만 하고 실행하지 않는다.
- JSON을 변경하는 주체는 메인 에이전트뿐이다. subagent가 실행 중일 때는 기준 SHA-256과 요구사항을 고정한다.
- 변경 직전 조회 결과의 `source.sha256`을 `--expect-hash`에 전달한다. 성공 후 새 SHA-256으로 다시 조회한다.
- 허용 전이는 `todo → in_progress|needs_info|blocked|cancelled`, `in_progress → in_review|needs_info|blocked|cancelled`, `in_review → done|needs_info|blocked|cancelled`, `needs_info|blocked → todo|in_progress`이다. `done`, `cancelled`에서는 전이하지 않는다.
- `needs_info`, `blocked`에는 질문 또는 막힌 원인과 다음 행동을 `--note`로 기록한다. 실제 착수 시 `--owner`와 착수 근거를 기록한다.
- `done`은 리뷰, `done_when`, deps·하위 작업, `npm run check`가 확인된 뒤에만 `--evidence`와 `--verification`을 포함해 기록한다.
