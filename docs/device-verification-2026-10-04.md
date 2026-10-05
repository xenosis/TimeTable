# 실기기 검증 기록 — 2026-10-04

## 2026-10-05 실기기 검증 재개 준비

- 사용자가 실기기 검증을 우선하도록 지시했다. 현재 ADB는 `emulator-5554`만 표시하며, Windows의 연결된 USB 장치와 ADB 무선 검색에서도 스마트폰이 감지되지 않았다. 연결 복구를 요청했고 실제 스마트폰 조작·설치는 아직 수행하지 않았다.
- 이후 수정한 보석 개수 편집의 키보드 첫 탭 처리, 오늘 화면 갱신·오류 복구, 관리자 입력·달력 수정을 포함해 `scripts/build-apk.ps1 -OfflineTest -Target Device`를 다시 실행했다. `BUILD SUCCESSFUL in 2m` 확인. 로그: `.tmp/device-latest-arm64-build.log`.
- 설치 준비 파일: `.tmp/TimeTable-v1.45.1-OfflineTest-Device-arm64-v8a-latest-debugsigned.apk`. 패키지 `com.sewoong.kidtimetable`, 버전 `1.45.1 / 107`, ABI `arm64-v8a`를 aapt로 확인했다. APK SHA-256: `6fc03f39cebb02f0723651ea7a15c1c79da20b7089b325bfa233690ba83e63c0`.
- 기존 설치용 APK와 동일한 테스트 인증서로 서명하고 apksigner 검증을 통과했다. 인증서 SHA-256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. 연결 후 기존 앱 인증서를 다시 대조하고 데이터 보존 업데이트로 설치한다.
- 실기기 원래 글자 크기·밀도·회전 설정을 유지한다. 이번 APK의 실제 설치와 관리자 입력·저장/취소 및 위젯 결과는 연결 후 별도로 기록한다. 빌드 성공을 실기기 검증 통과로 취급하지 않는다.

## 기기와 검증 버전

- 연결된 기기: Samsung S23 Ultra, SM-S918N, ARM64. 딸 폰 SM-A245N과 구별한다.
- 기존 앱: 1.44.0 / versionCode 105. 1.45.0 / 106을 거쳐 1.45.1 / 107 설치 확인. 요일 선택기 추가 수정은 재빌드·재검증 전이다.
- 대상 커밋: `7e42360`, GitHub `xenosis/TimeTable`의 main에 푸시 완료.
- 빌드: `scripts/build-apk.ps1 -OfflineTest -Target Device`, BUILD SUCCESSFUL.
- APK의 aapt 결과에서 패키지 `com.sewoong.kidtimetable`, 버전 1.45.0, native-code arm64-v8a 확인.
- 기존 설치 앱의 테스트 서명과 프로젝트 릴리즈 서명이 달라 첫 업데이트가 거절됐다. 앱을 삭제하지 않았다. 기존 1.44.0과 같은 테스트 인증서로 다시 서명한 OfflineTest APK를 `adb install -r`로 설치해 Success 확인.
- 사용 APK: `TimeTable-v1.45.0-OfflineTest-Device-arm64-v8a-debugsigned.apk`. 오프라인 release 변형이며 서명만 테스트 인증서다. 개발 서버에 연결하지 않는다.
- 기존 할 일 1개, 미완료 0/1과 보석 작은 0개·큰 0개 유지 확인. 최신 날짜별 문구와 작은/큰 보석 문구 표시 확인.
- 원래 기기 설정: font_scale 0.8, density 560(physical 600), accelerometer_rotation 1, user_rotation 0. 360dp·font 1.0 확인 과정에서 잠시 바꿨다가 복원했다. 사용자가 변화를 확인하여 설명했고, 이후 폭·확대 글씨·회전 조합 검사는 에뮬레이터에서만 진행한다. 실기기는 원래 설정에서 확인한다.

## 현재 확인 범위

| 작업 | 진행/확인한 내용 | 남은 실제 검증 |
| --- | --- | --- |
| P5.12 할 일 위젯 | ARM64 업데이트 및 두 provider 등록 확인, 실기기 검증 착수 | 선택 미리보기·기본 2x2·큰 글씨·상태 문구·실제 배치 |
| P5.10 일정 위젯 | 기존 홈에 TimeTable 위젯이 없음을 확인 | 기본 4x2/4x3·여러 일정·큰 글씨·테마·진행/지난 표시 |
| P5.3 체크 | 최신 장부 정책을 검증 기준으로 확인 | 위젯 토글→앱/DB 반영, 취소선, 보석 장부 불변 |
| P5.4 자동 갱신 | 기존 체크리스트의 전환·잠금·절전·재부팅·자정 조건 대조 | 실제 시각 경계에서 앱 없이 갱신 및 복구 |
| P4.5 날짜 전환 | 자정·AppState 복귀 조건 대조 | 실제 날짜 경계 확인 |
| P4.7 보석판 | 자동 적립 기준 폐기, P4.13 최신 정책으로 절차 갱신 | 수동 장부·목표 달성 불변·연속 갱신의 실제 화면 |
| P4.8 할 일 알림 | P3 사용자 승인 done을 유지 | 관리자 편집과 예약 교체/완료/삭제·잠금 알람, 지정 딸 폰 근거 |
| P7.1 꾸미기 | 새 두 테마로 이전되는 실제 오늘 화면 확인 | 운영체제 아이콘·스플래시·알림 단색·지원 런처의 테마 아이콘 |
| P9.7 관리자 회귀 | 관리자 PIN 보호 화면 확인 | PIN 잠금 해제 후 밀도·CRUD·키보드·보상·교시·요일복사·회귀 |

## 정책 및 사용자 입력 경계

- 장부 개수는 `gemCountRepository` 수동 입력만 변경한다. 체크·요청·지급·목표 달성은 자동 증감하지 않는다.
- 큰 보석 5점 환산은 P12 그림 변화만을 위한 값이다.
- 새 할 일은 생성일부터 완료·연속에 반영한다.
- 사용자가 관리자 PIN 사용을 허용했다. PIN 값을 문서나 파일에 기록하지 않는다. 사용자 입력과 기기 조작이 겹치지 않게 한다.
- 아직 위젯 실배치나 관리자 편집 검증을 통과로 기록하지 않았다. S23 결과만으로 SM-A245N 명시 조건을 충족했다고 기록하지 않는다.

## 관리자 키보드 회귀 발견 및 수정

- 할 일 이름 입력 직후 일요일 버튼을 한 번 누르고 추가하면 '반복 요일 또는 날짜를 선택해 주세요'가 표시됐다. 키보드가 내려간 상태에서 같은 요일·추가를 다시 누르면 검증용 `QA-P9-WIDGET-A`가 저장됐다.
- 관리자 외곽 ScrollView에 `keyboardShouldPersistTaps`가 없었다. 버튼의 첫 탭을 처리하도록 `handled`를 지정했다.
- 버전 1.45.1 / 107로 세 버전 파일을 함께 올렸다. 첫 수정의 전체 검사 48 suites / 313 tests와 Android debug build가 통과했다. 같은 테스트 서명의 ARM64 APK 설치 후 PIN 입력→편집 열기 첫 탭 통과를 확인했다(`.tmp/device-pin-first-tap-1451.png`).
- 검증용 할 일에서 삼성 한글 IME로 `검증` 입력, 취소→버림 확인→계속 편집, 수정 저장과 목록 반영을 확인했다. 요일 가로 ScrollView에도 첫 탭이 소비되어 월요일이 선택되지 않는 것을 accessibilityState로 확인했다. `AdminWeekdayPicker`에도 `keyboardShouldPersistTaps="handled"`를 추가했으며 이 추가 수정은 별도 전체 검사·재빌드·실기기 재검증 대상이다.
- 검증용 할 일 `QA-P9-WIDGET-A`(이후 `검증`으로 변경)는 삭제했다. 원래 할 일과 보석 장부는 변경하지 않았다. 기기 입력 언어는 한글인 상태로 확인했다.
- 요일 선택기 수정 후 S23에서 이름 입력 직후 일요일을 한 번 눌러 `selected=true`를 확인했다. 다만 키보드가 저장 버튼을 가리고, 앱 accessibility XML의 버튼 좌표가 키보드와 겹쳐 저장 탭 대신 글자가 입력되는 것을 실제 캡처로 구별했다. 이 시도는 저장 성공 근거가 아니다. 입력 초안을 취소하고 버렸다.
- 관리자 루트에 KeyboardAvoidingView를 추가하고 기존 Expo Router 공개 API의 헤더 높이를 반영했다. 타입 검사 통과. 최종 전체 검사·ARM64 재빌드·실기기 키보드 저장/취소 확인은 진행 중이다.
- 사용자가 검증을 위해 삼성 키보드로 설정했다고 알렸다. 현재 키보드 선택은 그대로 유지한다. 실기기와 에뮬레이터 결과를 따로 기록한다.
- 최종 KAV 수정의 전체 검사(`.tmp/device-quality-keyboard-final.log`)는 48 suites / 313 tests와 lint·typecheck·Android build 모두 통과했다. Device ARM64 재빌드와 같은 테스트 인증서의 `adb install -r` Success, 설치 버전 1.45.1 / 107도 확인했다. 실기기가 다른 앱 입력 화면으로 전환돼 동시 조작을 피하려고 터치를 중단하고 사용자 답을 기다린다. 설치 성공을 KAV 입력 검증 성공으로 취급하지 않는다.
- P9.7 dispatcher는 두 역할이 정상 종료했지만 실행 중 APK 빌드 산출물 3개가 바뀌어 REVIEW_FAILED였다. 이후 같은 schema/SHA로 등록 critical-reviewer·backlog-explainer를 병렬 재호출했다. 문서의 폐기 정책·1.3 필수 검사·40dp 기준은 해소됐고, 시간표 내부 교시/색/아이콘 탭 처리, 세트 busy 전환 차단, 기기 테스트 경로 안내는 보완 대상으로 남았다. 루트 KAV·시간표 모달의 실제 키보드 저장/취소는 여전히 미검증이다.
- 에뮬레이터 360dp·font 1.0에서 세트 목록과 요일 한 줄을 확인했다. 세트 행은 48dp씩이고 행 사이 12dp로 총 168dp이다(`.tmp/admin-360-font1-sets.png`). 에뮬레이터의 키보드가 측면 도구 모양으로 표시되어 키보드 가림 수정의 통과 근거로 사용하지 않는다.
- 사용자가 관리자 잠금을 직접 해제하고 검증용 PIN 사용을 허용했다. PIN 값은 문서나 로그에 기록하지 않는다.

## PC 검증 추가 기록 (2026-10-04)

- 실기기와 별도로 emulator-5554에서 360dp / font 1.0으로 확인했다. 정상 Gboard가 표시되도록 에뮬레이터 입력 설정만 조정했으며 스마트폰 설정은 건드리지 않았다.
- 관리자 루트의 KeyboardAvoidingView가 입력 영역을 줄이는 것을 확인했다. 키보드 위로 저장 버튼을 스크롤한 뒤 첫 탭 저장이 성공했다(`.tmp/pc-admin-first-tap-save-success.png`). 입력 중 취소는 버림 확인을 거쳐 목록으로 돌아왔으며 검증용 할 일 123은 삭제했다.
- 시간표 교시·색·아이콘의 내부 가로 스크롤에도 handled를 적용했다. 시간표 세트 적용은 DB 쓰기와 알람 갱신이 끝날 때까지 busy를 유지하고 오류에도 해제된다. 이를 지연 Promise를 사용한 2개 회귀 테스트로 확인했다.
- AdminCollapsible 초기 상태를 리터럴 useState(false)로 바꿔 프로젝트 Hermes 초기화 규칙을 지켰다.
- TodayScheduleCard는 요일·세트·refreshKey를 합친 조회 식별자로 로딩과 오류를 구분한다. 같은 요일의 새로고침과 세트 변경 중 로딩 문구, 완료 후 일정 표시를 2개 회귀 테스트로 확인했다.
- 작은 보석 2개 / 큰 보석 3개는 재시작 후 실제 보석 화면 캡처와 XML에서 확인했다(`.tmp/pc-gems-2-3-restart-visible.png`, `.tmp/pc-gems-2-3-restart.xml`). 오늘 상단만 보이는 캡처는 개수 표시 근거로 사용하지 않는다.
- 수동 입력 검증이 끝난 뒤 작은 보석 0개 / 큰 보석 0개로 복구하고 저장 후 화면과 XML을 확인했다(`.tmp/pc-gems-restored-zero.png`, `.tmp/pc-gems-restored-zero.xml`). 원래 할 일은 완료 상태이며 임시 할 일은 삭제된 상태다.
- 한 차례 보석 조회 오류 안내가 나타났으나 재실행 뒤 재현되지 않았다. 임시 진단 로그는 제거했다. 오류의 원인을 해결했다고 기록하지 않는다.
- 위 결과는 PC 에뮬레이터 근거다. 실기기의 최종 키보드 조작·위젯 배치, 393dp/가로 전체 기준 확인은 별도 남은 항목이다.

## 리뷰 보완과 날짜 선택기 재검증

- P11 dispatcher `.tmp/reviews/P11-1efc75d2e5a3-1791120146337`는 두 역할 exit 0, review completed로 종료했다. 리뷰 지적은 승인과 구별한다.
- 시간표 세트 최초 조회 실패에 오류·재시도 버튼을 연결했고 앱 복귀 refresh에서도 재조회한다. 일정 카드의 시각은 렌더 시 읽고 30초 주기에는 재렌더하여 복귀 직후 오래된 시각 판정을 피한다. 할 일은 날짜·refreshKey에 대응하는 최신 결과가 도착하기 전 이전 체크를 표시/조작하지 않는다.
- 세트 조회 실패→버튼 복구, 외부 체크 변경→지연 재조회, 종료 시각 경계를 넘긴 복귀를 포함한 5개 테스트가 통과했다.
- emulator-5554 가로에서 2026년 8월(6주) 날짜 선택기의 제목·월 이동·닫기 버튼이 잘린 것을 XML과 캡처로 확인했다. DatePicker 높이를 화면 이내로 제한하고 날짜 그리드만 스크롤하도록 수정했다.
- 수정 후 월 이동 및 닫기 버튼이 화면 안에 온전히 보이고, 그리드를 스크롤해 31일을 선택하면 `2026-08-31`이 입력되는 것을 확인했다. `.tmp/pc-datepicker-six-week-landscape-fixed-top.png`, `-fixed-bottom.png` 및 동일 이름 XML이 근거다. 저장하지 않고 취소·버림 확인으로 초안을 정리했고 에뮬레이터 회전도 원래 자동/0으로 복구했다.
- 첫 보완 전체 검사는 lint의 동기 상태 갱신 및 테스트 import 규칙 오류로 실패했다. 해당 코드를 수정한 뒤 lint가 통과했으며, 최종 전체 검사는 `.tmp/pc-quality-recovery-verified.log`로 별도 실행한다. 실패 로그를 통과 근거로 사용하지 않는다.
- 최종 전체 검사 `.tmp/pc-quality-recovery-verified.log`는 52 suites / 320 tests, 지침 동기화·길이·lint·typecheck·Android debug build 모두 통과했다. P13 첫 dispatcher는 코드 변경 없이 사용량 한도로 두 역할 exit1에 실패했으며 성공 리뷰로 계산하지 않는다.

## PC 화면 비교·수동 장부 입력 추가 근거

- 평일 하루 4개(총20개), 긴 한글 제목·메모, 토·일 각1개를 별도 QA-P9-20 세트 fixture로 구성했다. 직접 DB fixture는 화면 밀도 확인용이며 CRUD 성공 근거로 사용하지 않는다. SQLite integrity_check=ok 및 요일별 개수를 확인했다.
- 360dp/393dp 세로에서 요일7칸 한 줄과 하루4개 행을 실제 캡처로 대조했다. 긴 제목은 한 줄 생략 표시하고 편집창에서 원문과 메모를 보존했다. 토·일 선택은 각각 해당 주말 항목으로 전환됐다. `.tmp/pc-admin-20-360-portrait.png`, `pc-admin-20-393-portrait.png`, 같은 XML 및 `pc-admin-weekend-393.png`.
- 393dp 가로는 목록과 편집 모달을 스크롤해 긴 원문과 수정저장·취소·삭제 버튼 접근을 확인했다(`.tmp/pc-admin-edit-393-landscape-top.png`, `-actions.png`). 전체20개를 한 번에 펼친 목록으로 기록하지 않는다. 가로의 하루4개 동시 노출을 요구하지 않으며 전체 세로 기준과 구분한다.
- 에뮬레이터 화면 크기를 런타임 중 변경했을 때 보조 메뉴 접근이 불안정해 앱을 다시 시작하고 재확인했다. 재시작 후360dp가로의 교시 폼(추가·저장)과 요일복사(원본·대상7요일·복사버튼)를 스크롤해 확인했다. 자동 캡처 이름만으로 통과 기록하지 않는다.
- QA fixture를 원래 DB로 복구한 뒤 기기 파일 SHA와 백업이 `06e54c10c9c4b98aab1ee2102c62f62007b0a16e8e2c7d957cfa492e00aa2ef3`로 일치했다. 원래3개세트와 작은/큰보석0/0을 앱에서 확인했다.
- 실제 키보드가 열린 GemCountEditor 취소 첫 탭이 키보드만 닫는 문제를 발견했다(`.tmp/pc-gem-keyboard-cancel-before.png`, `-after.png`). 내보석 바깥 ScrollView에도 keyboardShouldPersistTaps=handled를 적용한 뒤 동일 조건의 첫 취소 탭으로 모달까지 닫히는 것을 확인했다. 저장도 키보드가 열린 상태에서 첫 탭에 모달이 닫히고0/0이 유지됐다(`.tmp/pc-gem-first-tap-cancel-fixed-before.png`, `-after.png`, `pc-gem-first-tap-save-fixed-before.png`, `-after.png` 및after XML).
- 직전53 suites/324 전체검사는 통과했지만 첫탭 소스수정 후 재검사에서는 새 입력 컴포넌트 테스트 초기 렌더 hook이5초 초과하여 실패했다. 이를 통과로 기록하지 않는다. 초기 렌더에 비동기 I/O가 없어 setup을 동기act로 정리하고 재검증한다.

## 키보드 첫 탭 보완 최종 결과

- 내보석 바깥 ScrollView의 handled 수정 후 키보드가 열린 상태에서 첫 취소·첫 저장이 입력 모달까지 닫는 것을 실관찰했다. before/after PNG와 after XML은 `.tmp/pc-gem-first-tap-cancel-fixed-*`, `.tmp/pc-gem-first-tap-save-fixed-*`다. 개수0/0을 유지했다.
- 최종 전체 검사 `.tmp/pc-quality-final-stable.log`는53 suites/324 tests, 지침 동기화·코드길이·lint·typecheck·Android debug build 모두PASS/QUALITY_CHECKS_OK다. 이전 hook timeout 실패 로그를 대체하는 별도 성공 근거다.
- emulator 홈에 TaskWidgetProvider(id4)와 TodayWidgetProvider(id5)가 실제로 배치된 것을 dumpsys와 캡처에서 확인했다. 기본 할일 영역은 런처2x2 칸, 일정은4x2 칸과 대응한다. `.tmp/pc-widget-launcher-before.png`, `.tmp/pc-widgets-current.txt`.
- 위젯 완료를 해제하면 홈0/1·미완료 행으로 즉시 바뀌고, 앱복귀 후 오늘0/1 및 작은보석0/큰보석0이 함께 보였다. 다시 위젯을 눌러 완료1/1로 복구하고 앱에서도1/1·장부0/0을 같은 화면에 확인했다. `.tmp/pc-widget-uncheck-current-policy.png`, `pc-widget-uncheck-app-counts.png`, `pc-widget-recheck-app-counts-visible.png` 및각XML. 완료상태와 장부가 둘다 보이지 않는 캡처는 이 근거로 사용하지 않는다.
- emulator font1.3에서도 현재 단일할일의 제목·완료문구·취소선이2x2영역 안에 보였다(`.tmp/pc-widgets-font13.png` 및XML). 여러할일 넘침/빈목록과 실기기·시간경계까지 검증한 것은 아니다. font1.0/자동회전1/user_rotation0으로 다시 복구했다.
