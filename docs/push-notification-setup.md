# 변경 푸시 설정과 확인

2026-10-11 현재 Firebase·Expo·FCM 설정과 운영 직접 발송 함수 적용은 완료했다. 1.62.12/176 두 폰에서 아빠 저장 → 딸 알림 도착 → 종료 후 실제 알림 탭 → 최신 할 일 표시를 확인했다. 재시도 함수 배포와 인증 검증도 완료했다. 남은 작업은 자동 실행 연결과 실제 대기 건 처리 확인이다. 코드 테스트 통과는 푸시 도착 증거가 아니다.

## 구현 흐름

아빠의 관리자 편집이 서버에 저장되면 `tt-notify-change`를 호출한다. 함수는 Supabase의 사용자 확인 API로 로그인한 사용자를 검증하고, 요청한 가족의 아빠인지 DB에서 확인한다. 해당 가족의 자녀에게 등록된 토큰만 사용한다. 서비스 역할 키나 사용자가 입력한 발신자 ID는 사용하지 않는다.

Android는 데이터 메시지를 받은 뒤 현재 딸 가족과 기기 역할을 확인하고 **보이는 알림**으로 게시한다. JS 백그라운드 작업의 실행을 기다리지 않는다. 다른 가족·아빠 기기·로그아웃 기기는 표시하지 않는다. 알림을 누르면 `push-change` 경로를 거쳐 현재 딸 가족만 동기화하고 홈으로 돌아간다.

앱 복귀와 Realtime 동기화도 계속 사용한다. Android가 강제 종료되었거나 연결이 없으면 푸시 수신을 보장할 수 없다. Expo 접수 건수를 실기기 도착이나 내용 적용 완료로 표시하지 않는다. 푸시 전송 실패는 이미 저장된 편집을 되돌리지 않는다.

## 필요한 설정

1. Firebase에 앱의 실제 Android 패키지명으로 앱을 등록한다. 현재 패키지 `com.chaea.timetable`으로 등록 완료했다. Firebase에 등록한 패키지명은 나중에 바꿀 수 없으므로 변경 후에는 새 Android 등록이 필요하다.
2. 해당 앱의 `google-services.json`을 `android/app/google-services.json`에 둔다. 다른 앱의 등록 파일을 복사하지 않는다. 파일이 있으면 Gradle이 Google services 플러그인을 적용한다. Expo 설정에도 `android.googleServicesFile` 경로를 기록한다.
3. Expo 프로젝트의 실제 ID를 `app.json`의 `expo.extra.eas.projectId`에 기록하고 해당 프로젝트에 FCM v1 자격 증명을 등록한다. 서비스 계정 비공개 키는 앱이나 Git에 넣지 않는다.
4. 서버 함수 배포는 별도 승인 후 실행한다. `supabase/config.toml`의 `verify_jwt = true`와 함수 내부 사용자·가족 검증을 유지한다. Expo 프로젝트가 액세스 토큰 보호를 사용하면 서버 함수의 `EXPO_ACCESS_TOKEN` 비밀값도 설정한다.
5. 딸 계정으로 로그인하고 기존 알림 권한을 허용한 릴리즈 APK에서 토큰을 등록한다. 토큰 갱신 시 같은 사용자·토큰 행을 갱신한다. 권한이 없거나 프로젝트 설정이 없으면 토큰을 등록하지 않는다.

## 검증

- `npm run check`: 앱 검사·Android 빌드·Kotlin 가족 필터 테스트와 푸시 함수 테스트를 포함한다.
- `npm run test:push`: 로그인 없음·잘못된 가족·유효하지 않은 사용자·아빠 역할 아님을 차단하고, 가족별 자녀 토큰 조회·중복 제거·Expo 실패 응답을 검사한다.
- 실제 완료 조건: 아빠 계정의 시간표 또는 할 일 저장 뒤 딸 폰에 “시간표가 바뀌었어요”가 도착하고, 탭 후 최신 내용이 표시되는지 확인한다. 다른 가족·로그아웃·아빠 역할 기기에는 표시하지 않는지도 확인한다.

## 확인한 문서

- [Firebase Android 설정](https://firebase.google.com/docs/android/setup)
- [Expo 푸시 설정](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Expo 메시지 종류와 수신 제한](https://docs.expo.dev/push-notifications/what-you-need-to-know/)
- [Supabase 함수 인증](https://supabase.com/docs/guides/functions/auth)
## 과거 1.55.1 리뷰 당시 상태

아래 미적용·미완료 설명은 당시 기록이다. 이후 운영 적용과 현재 남은 작업은 이 문서 첫머리 및 아래 운영 기록을 기준으로 확인한다.

- 인증 확인 중 일시적인 통신 실패를 재시도 대상으로 처리한다. 계정 전환 뒤 이전 요청은 버린다.
- 새 migration `20261007184801_tt_push_delivery_queue.sql`은 시간표·할 일 변경과 같은 트랜잭션에서 가족별 발송 대기 기록을 만든다. 운영 서버에는 아직 적용하지 않았다.
- 발송 요청은 큐의 이벤트를 임대한다. 이전 이벤트의 완료가 그동안 저장된 새 이벤트를 지우지 않는다. 실패하거나 응답이 유실되면 대기 기록이 남는다.
- 서버 함수가 변경 순서를 보내고 Android가 이미 표시한 순서 이하의 이벤트를 걸러낸다.
- 임시 가족을 사용하는 롤백 시험에서 기록 생성·병합·중복 임대 차단·새 변경 보존·권한 거절·가족 삭제를 확인했다. 함수 연결 후 전체 검사는 별도로 진행 중이다.
- 자동 발송 작업자 연결, Expo ticket·receipt 보관과 만료 토큰 처리, 설치본별 계정·토큰 이전은 아직 구현을 끝내지 않았다. 현재 코드를 실제 수신 완료로 판정하지 않는다.


## 운영 적용과 수신 확인 (2026-10-10, 사용자 승인)

- Firebase(routineplanner-e9bbd)에 `com.chaea.timetable` 앱 등록, `android/app/google-services.json` 추가, Expo 프로젝트(@xenosis/chaea-timetable)에 사용자가 Doro와 같은 프로젝트의 서비스 계정 키를 FCM V1 자격으로 업로드했다. `eas.json`은 자격 등록용 최소 설정이다(빌드는 계속 로컬 Gradle).
- 마이그레이션 `20261007184801_tt_push_delivery_queue.sql`·`20261007193428_tt_push_installation.sql`을 한 트랜잭션으로 운영 서버에 적용했다(`db query -f`, 이력 테이블 없음). 적용 전 BEGIN…ROLLBACK 시험, 적용 후 `tt_push_queue_check` 통과·`tt_rls_check` 59건·`tt_family_edit_check` 10건 기대값 일치.
- `tt-notify-change` 배포(verify_jwt 유지). 로그인 없이 호출하면 401.
- 당시 딸 폰(1.59.2, 딸 계정)의 Expo 토큰이 `tt_devices`에 등록됨. 함수와 같은 모양의 데이터 메시지(type family-change, changeOrder 1 — 서버 순번 68보다 작아 이후 실제 알림을 막지 않음)를 Expo로 직접 보내 딸 폰 알림 목록에 `family-change`(id 6901, 채널 family-changes) 표시를 확인했다. 당시 FCM V1 자격과 폰 표시 경로만 확인했고 전체 경로는 2026-10-11의 1.62.12 두 폰 검증에서 확인했다.
- 작업자도 기본 JWT 검사를 유지하며, 서버 호출은 유효한 JWT와 `TT_PUSH_WORKER_SECRET` 헤더를 함께 전달한다. 이전 JWT 비활성화 배포는 자동 승인 검토에서 거절됐으며 이 설정으로 실행하지 않는다.
- 남은 것: 자동 재시도 실행 연결과 실제 대기 건 처리 확인. 서버 비밀은 등록 완료이며, 아빠 저장 후 실제 도착·정상 종료/프로세스 종료 뒤 알림 탭은 1.62.12 두 폰에서 확인했다.

## 자동 재시도 보완 (2026-10-11)
작업자 운영배포 성공 및 verify_jwt=true 확인. 인증 없음/비밀 누락/비밀 오류401, 정상 호출 재확인200(processed0/failed0). 첫 정상 호출503은 성공으로 취급하지 않는다. 자동 실행 연결은 아직 운영 적용 전이다.
새 migration20261010173000_tt_push_worker_schedule.sql은 pg_cron/pg_net과 매분 tt-push-worker 작업을 구성한다. 서버URL·JWT·작업자비밀은 전용 Vault 항목에서만 읽고 함수는 일반 사용자·서비스 역할의 직접 실행을 거절한다. BEGIN/예외ROLLBACK 시험에서 직접실행 거부3건·중복 작업1건·HTTP 예약1건을 확인(.tmp/p617-cron-rollback.log). 실제 서버 스케줄 적용과 자동 발송·receipt 처리 근거는 별도로 확인해야 한다.
공식 기준: https://supabase.com/docs/guides/functions/schedule-functions

1.62.13/177 자동 재시도 보완 전체 check PASS(91 suites/540 tests·Android build·push-tests, .tmp/p617-quality-16213-final.log). 커밋할 SQL 시험 파일 자체 롤백 검증5건 모두true(.tmp/p617-cron-repo-test.log). 등록 병렬 리뷰 완료(.tmp/reviews/P6.17-f5689bc9b966-1791653491197). 남은 운영 스케줄·자동 발송·receipt·시간표 변경 실기기 확인은 완료로 기록하지 않는다.
