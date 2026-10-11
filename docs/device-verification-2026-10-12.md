# 2026-10-12 완료 알림 실기기 검증

- 아빠 SM-S918N과 딸 SM-A245N을 동시에 ADB에서 확인했다. 두 설치본은 1.63.2/182이며 아빠 업데이트 설치는 Success로 종료됐다.
- 아빠 계정 재로그인 후 아빠 화면과 알림 허용 켜짐을 확인했다. 서버에는 양쪽 역할의 1.63.2 설치본에 푸시 토큰이 등록되어 있다. 토큰 값은 기록하지 않았다.
- 기존 오늘 할 일은 없었다. 알림 없음·보상 0인 임시 할 일 `완료 알림 검증 임시 1012`(서버 ID 76)를 만들고 딸 앱에 0/1로 표시됨을 확인했다.
- 딸 앱에서 직접 체크하자 1/1과 ‘오늘 할 일을 모두 끝냈어요!’가 표시됐다. 오늘 완료 큐 event_order 219가 생성되고 정상 예약 작업에서 attempts 1, sent true로 바뀌었다.
- 홈 화면에 둔 아빠 폰의 알림창에 ‘딸이 할 일을 모두 했어요’가 실제 표시됐다. 알림을 누르면 아빠 화면에서 ‘오늘 할 일 1개를 모두 했어요’, 해당 항목 체크 표시, 주간 100%가 나타났다. 서버 접수만으로 수신을 추정하지 않았다.
- 딸 앱에서 체크를 취소해 테스트용 일일 완료 보석 기록을 제거한 뒤 정확히 ID 76·가족·제목이 일치하는 임시 할 일을 삭제했다. 기존 보석 원장은 ID 32, delta 0, daily-completion:2026-10-10으로 유지됐다. 학교 시간표는 수정하지 않았다.
- 소리가 울리는 일정 알람 테스트와 계정 역할 전환은 수행하지 않았다. 정상 receipt 확인 및 삭제 후 양쪽 빈 할 일 상태의 최종 확인은 아래에 이어 기록한다.

근거: `.tmp/dad-login-current.xml`, `dad-parent-current.xml`, `child-completion-fixture.xml`, `child-completion-checked.xml`, `dad-completion-notification.xml`, `dad-completion-tap.xml`, `child-completion-unchecked.xml`.

## 후속 확인

양쪽 앱에서 오늘 할 일이 없는 상태를 확인했다. 서버는 할 일0·학교일정23·원장1·합계0을 유지했다. 정상15분 receipt 처리 뒤 pending_receipts0, sent true, attempts1을 확인하고 테스트 큐219를 정확히 삭제했다. 오늘 실제 전체 완료 알림 기회도 복구했다. P6.11 등록 리뷰 두 역할 정상 종료, 확인된 Critical/High 없음. 정책 조건은 push-notification-setup.md에 명시한다.
