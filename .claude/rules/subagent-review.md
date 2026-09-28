# 병렬 검토 규칙

- 메인은 동일한 schema version·SHA-256의 CLI 조회 결과와 관련 요구사항·코드 정보를 `critical-reviewer`와 `backlog-explainer`에 전달하고 둘을 병렬 실행한다.
- `critical-reviewer`는 읽기 전용이며 승인 역할을 하지 않는다. `backlog-explainer`의 쓰기는 `docs/backlog/**`에만 한정한다.
- 실행 중 기준 입력과 백로그 JSON을 변경하지 않는다. 두 결과를 합친 뒤 근거가 확인된 수정만 메인이 반영하고 재검증한다.
