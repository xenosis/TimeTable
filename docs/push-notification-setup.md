# 변경 푸시 설정과 확인

P6.9 구현 버전은 1.55.1/147이며 리뷰 보완 중이다. 아직 Firebase 앱·Expo 프로젝트·FCM 발신 자격 증명과 실기기 수신은 확인되지 않았다. 코드 테스트 통과는 푸시 도착 증거가 아니다.

## 구현 흐름

아빠의 관리자 편집이 서버에 저장되면 `tt-notify-change`를 호출한다. 함수는 Supabase의 사용자 확인 API로 로그인한 사용자를 검증하고, 요청한 가족의 아빠인지 DB에서 확인한다. 해당 가족의 자녀에게 등록된 토큰만 사용한다. 서비스 역할 키나 사용자가 입력한 발신자 ID는 사용하지 않는다.

Android는 데이터 메시지를 받은 뒤 현재 딸 가족과 기기 역할을 확인하고 **보이는 알림**으로 게시한다. JS 백그라운드 작업의 실행을 기다리지 않는다. 다른 가족·아빠 기기·로그아웃 기기는 표시하지 않는다. 알림을 누르면 `push-change` 경로를 거쳐 현재 딸 가족만 동기화하고 홈으로 돌아간다.

앱 복귀와 Realtime 동기화도 계속 사용한다. Android가 강제 종료되었거나 연결이 없으면 푸시 수신을 보장할 수 없다. Expo 접수 건수를 실기기 도착이나 내용 적용 완료로 표시하지 않는다. 푸시 전송 실패는 이미 저장된 편집을 되돌리지 않는다.

## 필요한 설정

1. Firebase에 앱의 실제 Android 패키지명으로 앱을 등록한다. 현재 패키지는 `com.sewoong.kidtimetable`이며, 사용자가 결정한 변경 목표는 `com.chaea.timetable`이다. P7의 이름 변경 순서를 임의로 앞당기지 않았다. Firebase에 등록한 패키지명은 나중에 바꿀 수 없으므로 변경 후에는 새 Android 등록이 필요하다.
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
## 1.55.1 리뷰 보완 진행

- 인증 확인 중 일시적인 통신 실패를 재시도 대상으로 처리한다. 계정 전환 뒤 이전 요청은 버린다.
- 새 migration `20261007184801_tt_push_delivery_queue.sql`은 시간표·할 일 변경과 같은 트랜잭션에서 가족별 발송 대기 기록을 만든다. 운영 서버에는 아직 적용하지 않았다.
- 발송 요청은 큐의 이벤트를 임대한다. 이전 이벤트의 완료가 그동안 저장된 새 이벤트를 지우지 않는다. 실패하거나 응답이 유실되면 대기 기록이 남는다.
- 서버 함수가 변경 순서를 보내고 Android가 이미 표시한 순서 이하의 이벤트를 걸러낸다.
- 임시 가족을 사용하는 롤백 시험에서 기록 생성·병합·중복 임대 차단·새 변경 보존·권한 거절·가족 삭제를 확인했다. 함수 연결 후 전체 검사는 별도로 진행 중이다.
- 자동 발송 작업자 연결, Expo ticket·receipt 보관과 만료 토큰 처리, 설치본별 계정·토큰 이전은 아직 구현을 끝내지 않았다. 현재 코드를 실제 수신 완료로 판정하지 않는다.

