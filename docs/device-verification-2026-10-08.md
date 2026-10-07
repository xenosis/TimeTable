# 2026-10-08 실기기 검증

## P6.8 인계와 보완

- 딸 폰 SM-A245N (ADB R59X3033P3X)에 1.54.1/140 릴리즈 설치 성공, 기존 로그인 유지 확인.
- 1.54.2/141 전체 check 통과: 73 suites/430 tests, 지침 동기화·소스 길이·lint·typecheck·Android debug build. `.tmp/codex-p68-quality-1542-final.log`.
- 정식 릴리즈 ARM64 빌드 성공 `.tmp/codex-p68-device-1542-build.log`. APK 버전 141, ABI arm64-v8a, 기존 SHA-256 서명 `295d86fba39aea91bbd9cde23a482d0214f84bc594b6535f938621f5d791dfeb` 일치.
- 아빠 계정 검증을 위한 에뮬레이터 로그인 화면 준비. 사용자 비밀번호 입력과 실제 아빠 화면 검증은 대기 중이다. 완료로 기록하지 않는다.

## P6.12 연결 차단 검증 진행

- 공유 Doro 서버를 실제 중지하지 않고, 딸 폰 Wi-Fi와 모바일 데이터를 끊었다. 초기 Wi-Fi 0, 모바일 데이터 1이며 검증 후 이 값으로 복구한다.
- 검증용 두 할 일 ID 1900068121 (`검증P612알림`, 00:06), 1900068122 (`검증P612알람`, 00:08). 날짜 2026-10-08, 스티커 보상 0. 테스트 후 이 ID·제목이 일치하는 행만 정리한다.
- 딸 계정 서버 연결 성공과 마지막 동기화 23:56 확인. 로컬 예약에 00:06 일반 알림과 00:08 전체화면 알람 및 30분 재알림이 들어 있음을 확인했다.
- 연결 차단 후 `dumpsys connectivity`: `Active default network: none`.
- 오프라인 자정 전환: 홈 위젯이 목요일로 바뀌고 오늘 할 일 0/2 및 두 테스트 항목을 표시했다. 위젯 경계 수신 기록 00:00:01.001.
- 일반 알림 수신 기록 00:06:00.012, NotificationRecord의 테스트 task ID·날짜·first 및 일반 알림 채널 게시 확인. 이 시점 관찰은 1.54.1/140에서 수행했다. 1.54.2 업데이트 완료 응답은 대기 중이었다.
- 1.54.2/141 설치 성공. 전체화면 알람 UI·소리는 설치 작업과 겹쳐 검증 근거로 사용하지 않는다. 사용자 지시에 따라 추가 알람 발생 검증은 중단했다.
- 테스트 두 행은 ID와 제목을 함께 대조해 삭제했고 서버 잔여 0건을 확인했다 (`.tmp/p612-cleanup-result.log`). 딸 폰에서 삭제 동기화와 빈 오늘 목록 확인, 해당 테스트의 향후 알람 예약 제거 확인. Wi-Fi 0·모바일 데이터 1로 복구하고 홈 화면으로 돌아왔다.
- 서버 실패 경로는 `sync-runner.test.ts`의 업로드·다운로드 실패 시 로컬 데이터 교체/알람 갱신 생략 및 `sync-pull.test.ts`의 잘못된 스냅샷 롤백 테스트로 검증한다. 서버는 로컬 알람 실행의 전제 조건이 아니다. 공유 서버 실제 중지와 전체화면 알람 성공은 주장하지 않는다.

- 1.54.3/142 최종 전체 검사 통과: 73 suites/434 tests, 지침·길이·lint·typecheck·Android debug build 및 Kotlin 테스트. 결과: .tmp/codex-p68-quality-1543-final.log. 테스트 종료 후 프로세스도 정상 종료해 QUALITY_CHECKS_OK를 확인했다.

- 1.54.4/143 전체 검사 통과: 73 suites/442 tests, 지침·길이·lint·typecheck·Android debug build 및 Kotlin 테스트 (.tmp/codex-p68-quality-1544.log). 지정 스크립트 ARM64 릴리즈 생성과 버전143·기존 서명 일치 확인 (.tmp/codex-p68-device-1544-build.log). 아빠 두 기기 확인은 하위 P6.16 needs_info로 분리했다.

- 1.54.4/143 딸 폰 설치 성공. 1.54.5/144 전체 check 정상 종료: 74 suites/448 tests, 지침·길이·lint·typecheck·Android build 모두 PASS (.tmp/codex-p68-quality-1545.log). 지정 스크립트 ARM64 릴리즈 생성 성공 (.tmp/codex-p68-device-1545-build.log).
- 1.54.6/145 전체 check 정상 종료: 74 suites/451 tests 및 Android build PASS (.tmp/codex-p68-quality-1546.log). 별도 가족별 관리자 시각 테스트 1건과 lint·길이 검사 통과. 같은 가족 역할 전환·재로그인 중 이전 동기화 폐기, 역할 조회 실패 시 기존 예약 유지. 지정 ARM64 릴리즈 버전145·기존 SHA-256 서명 일치 확인 (.tmp/codex-p68-device-1546-build.log). 추가 알람 발생 테스트는 수행하지 않았다.
- 1.54.6/145 딸 폰 설치 Success 및 dumpsys package 버전145 확인. 앱 실행 후 관찰한 AndroidRuntime 오류 없음. critical-reviewer 제한 시간 종료로 이번 리뷰를 통과로 주장하지 않는다.
